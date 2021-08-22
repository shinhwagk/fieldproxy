FROm denoland/deno
ARG VERSION
WORKDIR /build
RUN deno bundle https://github.com/shinhwagk/fieldproxy/raw/${VERSION}/main.ts bundle.js

FROM denoland/deno:alpine-1.13.1
WORKDIR /app
ADD fieldproxy.yml /etc/fieldproxy/fieldproxy.yml
ADD VERSION .
COPY --from=0 /build/bundle.js ./
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "bundle.js"]
CMD ["--log.level=INFO", "--config.file=/etc/fieldproxy/fieldproxy.yml"]