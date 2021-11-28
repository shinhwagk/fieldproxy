import * as log from "https://deno.land/std@0.116.0/log/mod.ts";

async function getLogger(lln: log.LevelName = "INFO") {
  await log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler(lln, {
        formatter: (rec) =>
          `${rec.datetime.toJSON()} ${rec.levelName} ${rec.msg}`,
      }),
    },
    loggers: {
      default: {
        level: lln,
        handlers: ["console"],
      },
    },
  });
  return log.getLogger();
}

let logger: log.Logger;

type LastUsedTime = number;

type FieldContainer = {
  [server: string]: { [fieldVal: string]: LastUsedTime };
};

class FieldBalancer {
  private upstream: string[] = []
  private readonly container: FieldContainer = {};

  constructor(private readonly outime: number) {
    this.refreshContainer();
    setInterval(() => {
      this.refreshContainer();
      this.cleanOuttimeField();
    }, 5000);
  }

  public getUpstream(): string[] {
    return this.upstream
  }

  public updateUpstream(upstream: string[]) {
    this.upstream = upstream
    this.refreshContainer()
  }

  private cleanOuttimeField() {
    for (const i of Object.keys(this.container)) {
      for (const [field, ltime] of Object.entries(this.container[i])) {
        if ((new Date()).getTime() - ltime > 1000 * this.outime) {
          delete this.container[i][field];
        }
      }
    }
  }

  private getContainerFieldsAverage(): number {
    const cLen = Object.keys(this.container).length;
    const avg = cLen === 0
      ? 0
      : Object.values(this.container)
        .map((s) => Object.keys(s).length)
        .reduce((a, b) => a + b, 0,)
      / cLen;
    return Math.floor(avg);
  }

  public refreshContainer(mode: 'manual' | 'auto' = 'auto') {
    // const { upstream } = yamlParse(Deno.readTextFileSync(this.upstreamFile)) as Upstream;
    for (const s of Object.keys(this.container)) {
      if (!this.upstream.includes(s)) {
        delete this.container[s];
      }
    }
    for (const s of this.upstream) {
      if (!Object.keys(this.container).includes(s)) {
        this.container[s] = {};
      }
    }

    if (mode === 'manual') {
      logger.info(this.container)
    } else {
      logger.debug(this.container)
    }
  }

  public getServerAddr(field: string): string | null {
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

class FieldProxy {
  private reqPalCnt = 0;
  private version = Deno.readTextFileSync("VERSION");

  constructor(
    private readonly field: string,
    private readonly fb: FieldBalancer
  ) { }

  async proxy(request: Request, proxyServer: string): Promise<Response> {
    const [host, port] = proxyServer.split(':')
    const url = new URL(request.url)
    url.hostname = host
    url.port = port || '80'
    const headers = new Headers(request.headers)
    headers.set("user-agent", `fieldproxy/${this.version}`)
    return await fetch(
      url,
      {
        method: request.method,
        headers,
        body: request.body
      },
    );
  }

  async fieldProxy(request: Request): Promise<Response> {
    const fieldVal = request.headers.get(this.field);
    request.headers.forEach((v, k) => logger.debug(k, v));
    logger.debug(`header: ${this.field}:${fieldVal}`);
    if (fieldVal) {
      const proxyServer = this.fb.getServerAddr(fieldVal);
      if (proxyServer) {
        try {
          logger.info(`field: ${this.field}:${fieldVal} -> ${proxyServer}`);
          const _startTime = (new Date()).getTime();
          const res = await this.proxy(request, proxyServer);
          const _endTime = (new Date()).getTime();
          logger.debug(`field: ${fieldVal} -> ${proxyServer}, time: ${_endTime - _startTime}`,);
          return res
        } catch (e) {
          return new Response(e.message, { status: 502 });
        }
      } else {
        return new Response(`no servers under upstream.`, { status: 502 });
      }
    } else {
      return new Response(`field: ${fieldVal} not specified.`, { status: 502, });
    }
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === "/check") {
      return new Response(null, { status: 200 })
    } else if (url.pathname === "/upstream") {
      if (request.method === 'POST') {
        try {
          const upstream = await request.json()
          this.fb.updateUpstream(upstream)
          logger.info(`upstream updated.`)
          return new Response(`upstream updated. \nupstream: ${JSON.stringify(upstream)}.`, { status: 200 })
        } catch (e) {
          return new Response(`upstream update filed, error: ${e}`, { status: 502, });
        }
      } else if (request.method === "GET") {
        return new Response(`upstream list: ${JSON.stringify(this.fb.getUpstream())}`, { status: 200, });
      }

      // this.fb.refreshContainer('manual')

    }
    // this.reqPalCnt -= 1
    return await this.fieldProxy(request)

  }

  async start(port: number) {
    const server = Deno.listen({ port });
    for await (const conn of server) {
      (async () => {
        const httpConn = Deno.serveHttp(conn);
        for await (const requestEvent of httpConn) {
          const res = await this.handle(requestEvent.request)
          await requestEvent.respondWith(res)
        }
      })();
    }
  }
}

async function main() {
  const PROXY_PORT = Deno.env.get("PROXY_PORT") || '8000';
  const PROXY_FIELD = Deno.env.get("PROXY_FIELD") || 'x-proxyfield';
  const PROXY_OUTTIME = Deno.env.get("PROXY_OUTTIME") || '60';
  const PROXY_LOG_LEVEL = (Deno.env.get("PROXY_LOG_LEVEL") || 'INFO') as log.LevelName;
  logger = await getLogger(PROXY_LOG_LEVEL);
  const fb = new FieldBalancer(Number(PROXY_OUTTIME));
  (new FieldProxy(PROXY_FIELD, fb)).start(Number(PROXY_PORT));
}

main();
