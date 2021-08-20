import { readAll } from "https://deno.land/std/io/util.ts"
import { serve } from "https://deno.land/std@0.103.0/http/server.ts";
import { readerFromStreamReader } from "https://deno.land/std/io/mod.ts";
import { parse } from "https://deno.land/std@0.103.0/encoding/yaml.ts";

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

async function httpClient(server: string, url: string, method: string, headers: Headers, body: string) {
    const res = await fetch(`http://${server}${url}`, {
        method: method,
        headers: headers,
        body: body
    })
    return { status: res.status, headers: res.headers, body: res.body }
}

class FieldProxy {
    private readonly c = new Configure()
    private readonly lb = new LoadBalancer(this.c)
    async start(port: number) {
        console.log(this.c.c.upstream)
        const server = serve({ port });
        console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);
        for await (const request of server) {
            try {
                const fieldVal = request.headers.get(this.c.c.field)
                console.log(`header: ${this.c.c.field}:${fieldVal}`)
                console.log(`debug: ${request.headers.values()}`)
                if (fieldVal) {
                    const server = this.lb.getServerAddr(fieldVal)
                    console.log(server)
                    if (server) {
                        const { status, headers, body } = await httpClient(server, request.url, request.method, request.headers, (new TextDecoder()).decode(await readAll(request.body)))
                        console.log(status, headers.values(), body)
                        if (body) {
                            request.respond({ status: status, body: readerFromStreamReader(body.getReader()), headers });
                        } else {
                            request.respond({ status: status, headers });
                        }
                    } else {
                        request.respond({ status: 200, body: `filde: ${fieldVal} not exist` });
                    }
                } else {
                    request.respond({ status: 200, body: `filde: ${fieldVal} not null` });
                }
            } catch (e) {
                console.error(e)
                request.respond({ status: 500, body: e.message });
            }
        }
    }
}

(new FieldProxy).start(Number(Deno.env.get('FP_PORT') || "8000"))