FROM denoland/deno
WORKDIR /app
ADD main.ts .
ADD fieldproxy.yml /etc/fieldproxy/fieldproxy.yml
ADD fieldproxy.yml.tpl /etc/fieldproxy/fieldproxy.yml.tpl
CMD deno run --allow-net --allow-env --allow-read=/etc/fieldproxy/fieldproxy.yml main.ts