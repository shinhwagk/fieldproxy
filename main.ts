import {
  Response,
  serve,
  ServerRequest,
} from "https://deno.land/std@0.105.0/http/server.ts";
import {
  readableStreamFromReader,
  readerFromStreamReader,
} from "https://deno.land/std@0.105.0/io/mod.ts";
import { parse as yamlParse } from "https://deno.land/std@0.105.0/encoding/yaml.ts";
import { parse as flagsParse } from "https://deno.land/std@0.105.0/flags/mod.ts";
import * as log from "https://deno.land/std@0.105.0/log/mod.ts";

export async function getLogger(ln: log.LevelName = "INFO") {
  await log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler(ln, {
        formatter: (rec) =>
          `${rec.datetime.toJSON()} ${rec.levelName} ${rec.msg}`,
      }),
    },
    loggers: {
      default: {
        level: ln,
        handlers: ["console"],
      },
    },
  });
  return log.getLogger();
}

let logger: log.Logger;

interface Conf {
  field: string;
  upstream: string[];
  outtime: number; // default second
  port: number;
}

type LastUsedTime = number;

type FieldContainer = {
  [server: string]: { [fieldVal: string]: LastUsedTime };
};

class FieldConfigure {
  c: Conf;
  v: string;
  constructor(private readonly f: string = "/etc/fieldproxy/fieldproxy.yml") {
    this.c = this.read();
    this.v = Deno.readTextFileSync("VERSION");
    setInterval(() => this.c = this.read(), 5000);
  }
  private read() {
    logger.debug(`load config file: ${this.f}.`);
    return yamlParse(Deno.readTextFileSync(this.f)) as Conf;
  }
}

class FieldBalancer {
  private readonly container: FieldContainer = {};

  constructor(private readonly fc: FieldConfigure) {
    this.refreshContainer();
    setInterval(() => {
      this.refreshContainer();
      this.cleanOuttimeField();
    }, 5000);
  }

  private cleanOuttimeField() {
    for (const i of Object.keys(this.container)) {
      for (const [field, ltime] of Object.entries(this.container[i])) {
        if ((new Date()).getTime() - ltime > 1000 * this.fc.c.outtime) {
          delete this.container[i][field];
        }
      }
    }
  }

  private getContainerFieldsAverage(): number {
    const cLen = Object.keys(this.container).length;
    const avg = cLen === 0
      ? 0
      : Object.values(this.container).map((s) => Object.keys(s).length).reduce(
        (a, b) => a + b,
        0,
      ) / cLen;
    return Math.floor(avg);
  }

  private refreshContainer() {
    const servers: string[] = this.fc.c.upstream;
    for (const s of Object.keys(this.container)) {
      if (!servers.includes(s)) {
        delete this.container[s];
      }
    }
    for (const s of servers) {
      if (!Object.keys(this.container).includes(s)) {
        this.container[s] = {};
      }
    }
    logger.debug(this.container);
  }

  getServerAddr(field: string): string | null {
    // is exist
    for (const i of Object.keys(this.container)) {
      if (Object.keys(this.container[i]).includes(field)) {
        this.container[i][field] = (new Date()).getTime();
        return i;
      }
    }
    // if not exist
    for (const i of Object.keys(this.container)) {
      if (
        Object.keys(this.container[i]).length <=
        this.getContainerFieldsAverage()
      ) {
        this.container[i][field] = (new Date()).getTime();
        return i;
      }
    }

    return Object.keys(this.container).length >= 1
      ? Object.keys(this.container)[0]
      : null;
  }
}

async function httpClient(
  proxyUrl: string,
  method: string,
  headers: Headers,
  body: ReadableStream<Uint8Array>,
) {
  const res = await fetch(proxyUrl, {
    method: method,
    headers: headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : body,
  });
  return { status: res.status, headers: res.headers, body: res.body };
}

class FieldProxy {
  private reqPalCnt = 0;
  private readonly fb;

  constructor(private readonly c: FieldConfigure) {
    this.fb = new FieldBalancer(c);
  }

  async proxy(request: ServerRequest, proxyUrl: string): Promise<Response> {
    request.headers.set("user-agent", `fieldproxy/${this.c.v}`);
    const { status, headers, body } = await httpClient(
      proxyUrl,
      request.method,
      request.headers,
      readableStreamFromReader(request.body),
    );
    const _body = body ? readerFromStreamReader(body.getReader()) : undefined;
    return { status, headers, body: _body };
  }

  async fieldProxy(request: ServerRequest) {
    const fieldVal = request.headers.get(this.c.c.field);
    request.headers.forEach((v, k) => logger.debug(k, v));
    logger.debug(`header: ${this.c.c.field}:${fieldVal}`);
    if (fieldVal) {
      const server = this.fb.getServerAddr(fieldVal);
      if (server) {
        const proxyUrl = `http://${server}${request.url}`;
        logger.info(`field: ${this.c.c.field}:${fieldVal} -> ${server}`);
        try {
          const _startTime = (new Date()).getTime();
          const res = await this.proxy(request, proxyUrl);
          const _endTime = (new Date()).getTime();
          await request.respond(res);
          logger.debug(
            `field: ${fieldVal} -> ${server}, time: ${_endTime - _startTime}`,
          );
        } catch (e) {
          logger.error(e.message);
          await request.respond({ status: 502, body: e.message });
        }
      } else {
        await request.respond({
          status: 502,
          body: `no servers under upstream.`,
        });
      }
    } else {
      await request.respond({
        status: 502,
        body: `field: ${fieldVal} not specified.`,
      });
    }
  }

  async start() {
    const server = serve({ port: this.c.c.port });
    logger.info(`fieldproxy version: ${this.c.v}`);
    logger.info(
      `HTTP webserver running.  Access it at:  http://localhost:8080/`,
    );
    for await (const request of server) {
      if (request.url === "/check") {
        request.respond({ status: 200 });
      } else {
        this.reqPalCnt += 1;
        this.fieldProxy(request)
          .catch((e: Error) => logger.error(e.message))
          .finally(() => this.reqPalCnt -= 1);
      }
      logger.debug(
        `current processing parallel request number: ${this.reqPalCnt}`,
      );
    }
  }
}

async function main() {
  const args = flagsParse(Deno.args);
  const argLogLevel = args.log?.level;
  const argConfigFile = args.config?.file;
  logger = await getLogger(argLogLevel);
  const fc = new FieldConfigure(argConfigFile);
  (new FieldProxy(fc)).start();
}

main();
