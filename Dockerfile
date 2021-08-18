FROM denoland/deno
WORKDIR /app
ADD main.ts .
CMD deno run --allow-net --allow-env