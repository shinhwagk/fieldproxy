FROM denoland/deno
WORKDIR /app
ADD main.ts .
ADD conf.yml /etc/fieldproxy/fieldproxy.yml
CMD deno run --allow-net --allow-env --allow-read=/etc/fieldproxy/fieldproxy.yml main.ts