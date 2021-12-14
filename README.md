# fieldproxy

## a simple http load balancer by custom header field.

> a request with custom header field enter into the proxy server, if the value
> of the field appears for the first time, then select a server with the least
> number of bound fields under upstream.

```

```
### envs

- FP_FIELD
- FP_OUTTIME
- FP_LOG_LEVEL
- PROXY_CONSUL_ADDR
- PROXY_CONSUL_SERVICE

### running

```sh
docker run -d \
  -v `pwd`/fieldproxy.yml:/etc/fieldproxy/fieldproxy.yml \
  shinhwagk/fieldproxy:latest \
  --log.level=INFO \
  --config.file=/etc/fieldproxy/fieldproxy.yml
```

### update upstream list

- data.json

```json
[
  { "server": "fieldproxy_devcontainer_server_2", "port": 80 },
  { "server": "fieldproxy_devcontainer_server_1", "port": 80 }
]
```

- update upstream

```sh
# manaul by curl
curl http://consul:8500/v1/catalog/service/fieldproxy | jq -c '[.[] | (.ServiceAddress+":"+(.ServicePort|tostring))]'
# by consul-template
consul-template -consul-addr "consul:8500" -exec "curl -s http://consul:8500/v1/catalog/service/fieldproxy | jq -c '[.[] | (.ServiceAddress+\":\"+(.Serv
icePort|tostring))]' | curl -XPOST -d @- http://app:8000/upstream"
```

### test: three http request

```sh
curl -H "X-multidatabase-dbid: w32" -XPOST http://127.0.0.1:8000/path -d 'body'
curl -H "X-multidatabase-dbid: w33" -XPOST http://127.0.0.1:8000/path -d 'body'
curl -H "X-multidatabase-dbid: w34" -XPOST http://127.0.0.1:8000/path -d 'body'
```

## effect

In 60 seconds(by set outtime)，

```
http request(w32) & http request(w34) <--> 4db89bc51bc7:8000.
http request(w33) <--> 4db89bc51bc6:8000.
```

```sh
export FP_FIELD=x-multidatabase-dbid
export FP_LOG_LEVEL=DEBUG
export PROXY_CONSUL_ADDR=consul:8500
export PROXY_CONSUL_SERVICE=fieldproxy
export FP_OUTTIME=60
```

## compile

```sh
mkdir -p dest; deno compile -o dest/fp --allow-env --allow-net main.ts
```
