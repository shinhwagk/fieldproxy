# fieldproxy

## simple http load balancer by custom header filde.

### running

```sh
docker run -d -e FP_PORT=8000 -v `pwd`/fieldproxy.yml:/etc/fieldproxy/fieldproxy.yml shinhwagk/fieldproxy:latest
```

### config

```yml
field: multidatabase-dbid #custom used field
outtime: 60 # second
upstream:
  - 4db89bc51bc7:8000
  - 4db89bc51bc6:8000
```

### test: three http request

```sh
curl -H "multidatabase-dbid: w32" -XPOST http://127.0.0.1:8000/path -d 'body'
curl -H "multidatabase-dbid: w33" -XPOST http://127.0.0.1:8000/path -d 'body'
curl -H "multidatabase-dbid: w34" -XPOST http://127.0.0.1:8000/path -d 'body'
```

## effect

In 60 seconds(by set outtime)，

```
http request(w32) & http request(w34) <--> 4db89bc51bc7:8000.
http request(w33) <--> 4db89bc51bc6:8000.
```
