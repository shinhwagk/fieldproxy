abs(hash(s)) % (10 ** 8)

```sh
export CONSUL_ADDR=dbmonitor.weihui.com:3000 
export CONSUL_SERVICE=multidatabasece-oracle
deno run --allow-net --allow-env main.ts
main.ts
```

## test

```sh
curl -H "multidatabase-dbid: w31" -XPOST http://test-proxy:8080/query -d
'{"db_id":"z11","sql_text":"select * from dual"}'
```
