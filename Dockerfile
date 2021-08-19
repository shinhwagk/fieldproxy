FROM denoland/deno
WORKDIR /app
ADD main.ts .
ADD conf.yml /etc/fieldproxy/fieldproxy.yaml
CMD deno run --allow-net --allow-env --allow-read main.ts