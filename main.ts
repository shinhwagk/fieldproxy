import { serve, ServerRequest } from "https://deno.land/std@0.103.0/http/server.ts";
import { readerFromStreamReader, readableStreamFromReader } from "https://deno.land/std/io/mod.ts";
import { parse } from "https://deno.land/std@0.103.0/encoding/yaml.ts";
import * as log from "https://deno.land/std@$0.103.0/log/mod.ts";

interface Conf {
    field: string;
    upstream: string[];
    outtime: number; // default second
}

type LastUsedTime = number

class Configure {
    f = "/etc/fieldproxy/fieldproxy.yml"
    c: Conf = this.read()
    constructor() {
        setInterval(() => this.c = this.read(), 5000)
    }
    read() {
        return parse(Deno.readTextFileSync(this.f)) as Conf
    }
}

class LoadBalancer {
    private container: { [server: string]: { [field: string]: LastUsedTime } } = {}

    constructor(private readonly c: Configure) {
        setInterval(() => { this.refreshContainer(); this.cleanUnusedField() }, 5000)
    }

    private cleanUnusedField() {
        for (const i of Object.keys(this.container)) {
            for (const [field, ltime] of Object.entries(this.container[i])) {
                if ((new Date()).getTime() - ltime > 1000 * this.c.c.outtime) {
                    delete this.container[i][field]
                }
            }
        }
    }

    private getContainerFieldsAverage() {
        const cLen = Object.keys(this.container).length
        const avg = cLen === 0 ? 0 : Object.values(this.container).map(s => Object.keys(s).length).reduce((a, b) => a + b, 0) / cLen
        return Math.floor(avg)
    }

    private refreshContainer() {
        const servers: string[] = this.c.c.upstream
        for (const s of Object.keys(this.container)) {
            if (!servers.includes(s)) {
                delete this.container[s]
            }
        }
        for (const s of servers) {
            if (!Object.keys(this.container).includes(s)) {
                this.container[s] = {}
            }
        }
        console.log(this.container, this.getContainerFieldsAverage())
    }

    getServerAddr(field: string): string | null {
        // is exist
        for (const i of Object.keys(this.container)) {
            if (Object.keys(this.container[i]).includes(field)) {
                this.container[i][field] = (new Date()).getTime()
                return i
            }
        }
        // if not exist
        for (const i of Object.keys(this.container)) {
            if (Object.keys(this.container[i]).length <= this.getContainerFieldsAverage()) {
                this.container[i][field] = (new Date()).getTime()
                return i
            }
        }

        return Object.keys(this.container).length >= 1 ? Object.keys(this.container)[0] : null;
    }
}

async function httpClient(proxyUrl: string, method: string, headers: Headers, body: BodyInit | null) {
    const res = await fetch(proxyUrl, {
        method: method,
        headers: headers,
        body: body
    })
    return { status: res.status, headers: res.headers, body: res.body }
}

class FieldProxy {
    private reqCnt = 0
    private readonly c = new Configure()
    private readonly lb = new LoadBalancer(this.c)

    async proxy(request: ServerRequest, proxyUrl: string) {
        const { status, headers, body } = await httpClient(proxyUrl, request.method, request.headers, readableStreamFromReader(request.body))
        const _body = body ? readerFromStreamReader(body.getReader()) : undefined
        await request.respond({ status: status, headers, body: _body });
    }

    async fieldProxy(request: ServerRequest) {

        const fieldVal = request.headers.get(this.c.c.field)
        console.log(`header: ${this.c.c.field}:${fieldVal}`)
        if (fieldVal) {
            const server = this.lb.getServerAddr(fieldVal)
            if (server) {
                const proxyUrl = `http://${server}${request.url}`
                const _startTime = (new Date()).getTime()
                await this.proxy(request, proxyUrl)
                const _endTime = (new Date()).getTime()
                console.log(`time: ${fieldVal}, ${_endTime - _startTime}`)
            } else {
                await request.respond({ status: 200, body: `filde: ${fieldVal} not exist` });
            }
        } else {
            await request.respond({ status: 200, body: `filde: ${fieldVal} not specified` });
        }
    }

    async start(port: number) {
        const server = serve({ port });
        console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);
        for await (const request of server) {
            console.log(`request: ${this.reqCnt}`)
            this.reqCnt += 1
            try {
                if (request.url === '/check') {
                    request.respond({ status: 200 });
                } else {
                    this.fieldProxy(request).catch((e) => console.log(e))
                }
            } catch (e) {
                console.error(e)
                request.respond({ status: 502, body: e.message });
            } finally {
                this.reqCnt -= 1
                console.log(`request: ${this.reqCnt}`)
            }
        }
    }
}

(new FieldProxy).start(Number(Deno.env.get('FP_PORT') || "8000"))