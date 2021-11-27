# fieldproxy

## a simple http load balancer by custom header field.
> a request with custom header field enter into the proxy server, if the value of the field appears for the first time, then select a server with the least number of bound fields under upstream.

### running

```sh
docker run -d \
  -v `pwd`/fieldproxy.yml:/etc/fieldproxy/fieldproxy.yml \
  shinhwagk/fieldproxy:latest \
  --log.level=INFO \
  --config.file=/etc/fieldproxy/fieldproxy.yml
```

### config file (fieldproxy.yml)

```yml
port: 8000
field: X-multidatabase-dbid # custom header field for load balancer.
outtime: 60 # second, when the field value is not requested within 60 seconds, the binding with the service is released.
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
