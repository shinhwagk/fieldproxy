import { readAll } from "https://deno.land/std/io/util.ts"
import { serve } from "https://deno.land/std@0.103.0/http/server.ts";
import { readerFromStreamReader } from "https://deno.land/std/io/mod.ts";

class LoadBalancer {
    private container: { [ca: string]: string[] } = {}
    private containerAverage = 0
    private services: string[] = []

    constructor() {
        setInterval(() => { this.refreshService(); this.refreshContainer(); this.refreshContainerAverage() }, 5000)
    }

    private async refreshService() {
        console.log("refreshService")
        console.log(this.container, this.containerAverage, this.services)
        this.services = await this.getServices()
    }

    private refreshContainerAverage() {
        const cLen = Object.keys(this.container).length
        this.containerAverage = cLen === 0 ? 0 : Object.values(this.container).map(ds => ds.length).reduce((a, b) => a + b, 0) / cLen
    }

    private async getServices(): Promise<string[]> {
        const consulAddr = Deno.env.get('CONSUL_ADDR')
        const consulService = Deno.env.get('CONSUL_SERVICE')
        const services = await fetch(`http://${consulAddr}/v1/catalog/service/${consulService}`).then(res => res.json())
        return services.map((s: ConsulService) => `${s.ServiceAddress}:${s.ServicePort}`)
    }

    private refreshContainer() {
        for (const s of Object.keys(this.container)) {
            if (!this.services.includes(s)) {
                delete this.container[s]
            }
        }
        for (const s of this.services) {
            if (!Object.keys(this.container).includes(s)) {
                this.container[s] = []
            }
        }
    }

    getServiceAddr(dbId: string): string {
        // is exist
        for (const i of Object.keys(this.container)) {
            if (dbId in this.container[i]) {
                return i
            }
        }
        // if not exist
        for (const i of Object.keys(this.container)) {
            if (this.container[i].length <= this.containerAverage) {
                this.container[i].push(dbId)
                console.log(this.container)
                return i
            }
        }
        return Object.keys(this.container)[0]
    }

}

interface ConsulService {
    ServiceAddress: string
    ServicePort: number
}

async function MODClient(mdoAddr: string, body: string) {
    const res = await fetch(`http://${mdoAddr}/query`, {
        method: "POST",
        headers: { 'content-type': 'application/json' },
        body: body
    })
    return { headers: res.headers, body: res.body }
}

class MODProxy {
    private lb = new LoadBalancer()
    async start() {
        const server = serve({ port: 8080 });
        console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);
        for await (const request of server) {
            try {
                const dbId = request.headers.get('multidatabase-dbid')
                console.log(dbId)
                if (dbId) {
                    const modAddr = this.lb.getServiceAddr(dbId)
                    console.log(modAddr)
                    const { headers, body } = await MODClient(modAddr, (new TextDecoder()).decode(await readAll(request.body)))
                    console.log(body)
                    request.respond({ status: 200, body: readerFromStreamReader(body!.getReader()), headers });
                } else {
                    request.respond({ status: 200, body: "db id not exist" });
                }
            } catch (e) {
                console.log(e)
            }
        }
    }
}

(new MODProxy).start()