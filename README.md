# fieldproxy

## samiple http load balancer by header filde.

### running

```sh
docker run -d -e FP_PORT=8000 -v `pwd`/fieldproxy.yml:/etc/fieldproxy/fieldproxy.yml shinhwagk/fieldproxy:latest
```

### config

```yml
field: multidatabase-dbid
outtime: 60
upstream:
  - 4db89bc51bc7:8000
  - 4db89bc51bc6:8000
```

### test

```sh
curl -H "multidatabase-dbid: w32" -XPOST http://127.0.0.1:8000/path -d 'body'
curl -H "multidatabase-dbid: w33" -XPOST http://127.0.0.1:8000/path -d 'body'
```

## effect

In 60 seconds(by set outtime)，**w32** and **4db89bc51bc7:8000** are tied
together, **w33** and **4db89bc51bc6:8000** are tied together
