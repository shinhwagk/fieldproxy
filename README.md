# fieldproxy

## samiple http load balancer by header filde.

abs(hash(s)) % (10 ** 8)

```sh
export CONSUL_ADDR=dbmonitor.weihui.com:3000 
export CONSUL_SERVICE=multidatabasece-oracle
deno run --allow-net --allow-env main.ts
```

## test

```sh
curl -H "multidatabase-dbid: w31" -XPOST http://127.0.0.1:8000/query -d '{"db_id":"z11","sql_text":"select * from dual"}'
curl -H "multidatabase-dbid: w32" -XPOST http://127.0.0.1:8000/query -d '{"db_id":"z11","sql_text":"select * from dual"}'
curl -H "multidatabase-dbid: w33" -XPOST http://127.0.0.1:8000/query -d '{"db_id":"z11","sql_text":"select * from dual"}'
```

## used

```
http header: multidatabase-dbid
```
