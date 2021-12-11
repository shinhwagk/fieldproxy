const hostname = Deno.hostname();
const consulAddr = Deno.env.get('CONSUL_ADDR')
const consulService = Deno.env.get('FP_REGISTER_CONSUL_SERVICE')

if (consulAddr === undefined || consulService === undefined) {
    console.log("env CONSUL_ADDR or FP_REGISTER_CONSUL_SERVICE no set.")
    Deno.exit(1)
}

const body = {
    name: consulService, id: hostname, "address": hostname, "port": 8000,
    checks: [{ http: `http://${hostname}:8000/check`, interval: "10s" }]
}

await fetch(`http://${consulAddr}/v1/agent/service/register`,
    {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
    }
)
