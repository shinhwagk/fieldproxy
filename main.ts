import * as log from "https://deno.land/std@0.116.0/log/mod.ts";

const VERSION = "0.0.17-test1"

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
  // private reqPalCnt = 0;

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
    }
    // else if (url.pathname === "/services") {
    //   if (request.method === 'POST') {
    //     try {
    //       const services = await request.json()
    //       this.fb.updateUpstream(services)
    //       logger.info(`services updated.`)
    //       return new Response(`services updated. \nupstream: ${JSON.stringify(services)}.`, { status: 200 })
    //     } catch (e) {
    //       return new Response(`services update filed, error: ${e}`, { status: 502, });
    //     }
    //   } else if (request.method === "GET") {
    //     return new Response(`services list: ${JSON.stringify(this.fb.getUpstream())}`, { status: 200, });
    //   }

    //   // this.fb.refreshContainer('manual')

    // }
    // this.reqPalCnt -= 1
    return await this.fieldProxy(request)

  }

  async start(port: number) {
    const server = Deno.listen({ port });
    logger.info(`fieldporxy running.  Access it at:  http://:${port}/`)
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

async function getBackendServices(consulAddr: string, consulService: string): Promise<string[]> {
  try {
    return await fetch(`http://${consulAddr}/v1/health/service/${consulService}?passing=true`)
      .then(res => res.json())
      .then((services: { Service: { Address: string, Port: number } }[]) =>
        services.map(r => `${r.Service.Address}:${r.Service.Port}`)
      )
  } catch (e) {
    logger.error(`consul error ${e}`)
    return []
  }
}

function consoleServices(services: string[]) {
  logger.debug(`list services:`)
  for (const s of services) {
    logger.debug(`  - ${s}`)
  }
}

async function main() {
  const PROXY_PORT = Deno.env.get("PROXY_PORT") || '8000';
  const PROXY_FIELD = Deno.env.get("PROXY_FIELD") || 'x-proxyfield';
  const PROXY_OUTTIME = Deno.env.get("PROXY_OUTTIME") || '60'; // second
  const PROXY_LOG_LEVEL = (Deno.env.get("PROXY_LOG_LEVEL") || 'INFO') as log.LevelName;
  const PROXY_CONSUL_ADDR = Deno.env.get("PROXY_CONSUL_ADDR") || '';
  const PROXY_CONSUL_SERVICE = Deno.env.get("PROXY_CONSUL_SERVICE") || '';

  logger = await getLogger(PROXY_LOG_LEVEL);

  const fieldBalancer = new FieldBalancer(Number(PROXY_OUTTIME));

  const fn = async () => {
    const services = await getBackendServices(PROXY_CONSUL_ADDR, PROXY_CONSUL_SERVICE);
    fieldBalancer.setServices(services);
    fieldBalancer.refreshContainer();
    consoleServices(services)
  };

  setTimeout(fn, 1000);
  setInterval(fn, Number(PROXY_OUTTIME) * 1000);

  (new FieldProxy(PROXY_FIELD, fieldBalancer))
    .start(Number(PROXY_PORT));
}

main();
