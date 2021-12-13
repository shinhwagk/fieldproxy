#!/bin/sh

date

PROXY_SERVICES=`curl -s "http://consul:8500/v1/health/service/${FP_PROXY_CONSUL_SERVICE}?passing=true" | jq -c '[ .[] | .Service | (.Address+":"+(.Port|tostring)) ]'`
curl -s "http://consul:8500/v1/health/service/${FP_REGISTER_CONSUL_SERVICE}?passing=true" \
  | jq -r '.[] | .Service | (.Address+":"+(.Port|tostring))' \
  | while read saddr; do
        echo "update sevices for '${saddr}' -> '${PROXY_SERVICES}'"
        curl -s -XPUT http://${saddr}/services -d ${PROXY_SERVICES}
    done 
