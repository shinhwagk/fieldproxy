import * as log from "https://deno.land/std@0.117.0/log/mod.ts";

const VERSION = Deno.args[0]

const FP_LOG_LEVEL = (Deno.env.get("FP_LOG_LEVEL") || 'INFO') as log.LevelName;
await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler(FP_LOG_LEVEL, {
      formatter: (rec) =>
        `${rec.datetime.toJSON()} ${rec.levelName} ${rec.msg}`,
    }),
  },
  loggers: {
    default: {
      level: FP_LOG_LEVEL,
      handlers: ["console"],
    },
  },
});

const logger: log.Logger = log.getLogger();

type FieldContainer = {
  [server: string]: { [fieldVal: string]: number }; // type LastUsedTime = number;
};

class FieldBalancer {
  private services: string[] = []
  private readonly container: FieldContainer = {};

  constructor(private readonly outime: number) { }

  public setServices(services: string[]) {
    this.services = services
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

  public refreshContainer() {
    for (const s of Object.keys(this.container)) {
      if (!this.services.includes(s)) {
        delete this.container[s];
      }
    }
    for (const s of this.services) {
      if (!Object.keys(this.container).includes(s)) {
        this.container[s] = {};
      }
    }

    this.cleanOuttimeField()
  }

  public getServiceAddr(field: string): string | null {
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
  private reqPallCnt = 0;

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
    headers.set("user-agent", `fieldproxy/${VERSION}`)
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
      const proxyServer = this.fb.getServiceAddr(fieldVal);
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
        return new Response(`no servers under services.`, { status: 502 });
      }
    } else {
      return new Response(`field: ${fieldVal} not specified.`, { status: 502, });
    }
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === "/check") {
      return new Response(null, { status: 200 })
    } else if (request.method === 'PUT' && url.pathname === "/services") {
      const services = await request.json()
      this.fb.setServices(services);
      this.fb.refreshContainer()
      // logger.debug(`list service [${consulService}]:`)
      for (const s of services) {
        logger.info(`  - ${s}`)
      }
      return new Response(null, { status: 200 })
    }
    return await this.fieldProxy(request)
  }

  async start(port: number) {
    const server = Deno.listen({ port });
    logger.info(`fieldporxy running.  Access it at:  http://:${port}/`)
    for await (const conn of server) {
      (async () => {
        const httpConn = Deno.serveHttp(conn);
        for await (const requestEvent of httpConn) {
          try {
            this.reqPallCnt += 1
            const res = await this.handle(requestEvent.request)
            await requestEvent.respondWith(res)
          } catch (e) {
            logger.error(`http request error: ${e}`)
          } finally {
            this.reqPallCnt -= 1
          }
        }
      })();
    }
  }
}

function main() {
  const PROXY_PORT = 8000
  const FP_FIELD = Deno.env.get("FP_FIELD") || 'x-proxyfield';
  const FP_OUTTIME = Deno.env.get("FP_OUTTIME") || '60'; // second
  // const FP_LOG_LEVEL = (Deno.env.get("FP_LOG_LEVEL") || 'INFO') as log.LevelName;

  const fieldBalancer = new FieldBalancer(Number(FP_OUTTIME));

  const fn = () => {
    fieldBalancer.refreshContainer();
  };

  setInterval(fn, 1000);

  (new FieldProxy(FP_FIELD, fieldBalancer))
    .start(PROXY_PORT);
}

main();
