import { crypto } from "https://deno.land/std@0.117.0/crypto/mod.ts";
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

class FieldBalancer {
  private services: string[] = []
  private numberOfServices = 0

  constructor(private readonly filedForNumberOfServices: number) { }

  public setServices(services: string[]) {
    this.services = services
    this.numberOfServices = services.length
  }

  public async selectService(field: string): Promise<string | undefined> {
    const idx = await this.serviceIndexSelector(field,)
    return this.services[idx]
  }

  private async serviceIndexSelector(val: string) {
    let pob = this.filedForNumberOfServices
    if (this.filedForNumberOfServices > this.numberOfServices) {
      pob = this.numberOfServices
      logger.warning(`field for number of services: ${this.filedForNumberOfServices} more than number of services: ${this.numberOfServices}`)
    }

    const digest: ArrayBuffer = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(val),
    );
    return (new Uint8Array(digest)
      .reduce((a, b) => a + b, 0) + Math.ceil(Math.random() * pob)) % this.numberOfServices
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
      const proxyServer = await this.fb.selectService(fieldVal);
      if (proxyServer) {
        try {
          logger.info(`field: ${this.field}:${fieldVal} -> ${proxyServer}`);
          const _startTime = (new Date()).getTime();
          const res = await this.proxy(request, proxyServer);
          const _endTime = (new Date()).getTime();
          logger.debug(`field: ${fieldVal} -> ${proxyServer}, time: ${_endTime - _startTime}`,);
          return res
        } catch (e) {
          logger.error(`${this.field} -> ${fieldVal}, ${e.message}`)
          return new Response(e.message, { status: 502 });
        }
      } else {
        logger.error(`no servers under services.`)
        return new Response(`no servers under services.`, { status: 502 });
      }
    } else {
      logger.error(`field:${this.field} not specified.`)
      return new Response(`field:${this.field} not specified.`, { status: 502, });
    }
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === "/check") {
      return new Response(null, { status: 200 })
    } else if (request.method === 'PUT' && url.pathname === "/services") {
      const services = await request.json()
      this.fb.setServices(services);
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
            const res = await this.handle(requestEvent.request)
            await requestEvent.respondWith(res)
          } catch (e) {
            logger.error(`http request error: ${e}`)
          }
        }
      })();
    }
  }
}

function main() {
  const PROXY_PORT = 8000;
  const FP_FIELD = Deno.env.get("FP_FIELD") || 'x-field';
  const FP_FIELD_FOR_NUMBER_OF_SERVICES = Deno.env.get("FP_FIELD_FOR_NUMBER_OF_SERVICES") || '1';
  const fieldBalancer = new FieldBalancer(Number(FP_FIELD_FOR_NUMBER_OF_SERVICES));
  (new FieldProxy(FP_FIELD, fieldBalancer))
    .start(PROXY_PORT);
}

main();
