curl -XPUT http://consul:8500/v1/agent/service/register -d '{"id":"f1", "name": "backend","address": "fieldproxy_backend_1","port": 80, "checks": [{ "http": "http://fieldproxy_backend_1", "interval": "10s" }]}'
curl -XPUT http://consul:8500/v1/agent/service/register -d '{"id":"f2", "name": "backend","address": "fieldproxy_backend_2","port": 80, "checks": [{ "http": "http://fieldproxy_backend_2", "interval": "10s" }]}'
curl -XPUT http://consul:8500/v1/agent/service/register -d '{"id":"f3", "name": "backend","address": "fieldproxy_backend_3","port": 80, "checks": [{ "http": "http://fieldproxy_backend_3", "interval": "10s" }]}'
curl -XPUT http://consul:8500/v1/agent/service/register -d '{"id":"f4", "name": "backend","address": "fieldproxy_backend_4","port": 80, "checks": [{ "http": "http://fieldproxy_backend_4", "interval": "10s" }]}'
echo "test fieldproxy"
while true; do
    echo "test fieldproxy"
    curl --header "X-multidatabase-dbid:123" http://fieldproxy:8000/query -d '{ "db_id":"t11"}'
    curl --header "X-multidatabase-dbid:124" http://fieldproxy:8000/query -d '{ "db_id":"t12"}'
    curl --header "X-multidatabase-dbid:125" http://fieldproxy:8000/query -d '{ "db_id":"t12"}'
    curl --header "X-multidatabase-dbid:126" http://fieldproxy:8000/query -d '{ "db_id":"t12"}'
    sleep 1
done
