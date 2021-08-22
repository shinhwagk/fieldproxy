# fieldproxy

## samiple http load balancer by custom header field.

### running

```sh
docker run -d -v `pwd`/fieldproxy.yml:/etc/fieldproxy/fieldproxy.yml shinhwagk/fieldproxy:latest --log.level=INFO --config.file=/etc/fieldproxy/fieldproxy.yml
```

### config file (fieldproxy.yml)

```yml
port: 8000
field: X-multidatabase-dbid #custom header field for load balancer
outtime: 60 # second
upstream:
  - 4db89bc51bc7:8000
  - 4db89bc51bc6:8000
```

### config file for consul template

```yml
port: 8000
field: X-multidatabase-dbid #custom header field for load balancer
outtime: 60 # second
upstream:
  {{- range service "custom_services" }}
  - {{ .Address }}:{{ .Port }}
  {{- end }}
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
deno run --allow-net --allow-env --allow-read main.ts --log.level DEBUG --config.file fieldproxy.yml
```

## fieldproxy.yml.tpl for consul template
