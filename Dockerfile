FROM denoland/deno
ARG VERSION
WORKDIR /build
RUN deno compile -o /build/fp --allow-env --allow-net https://github.com/shinhwagk/fieldproxy/raw/${VERSION}/main.ts ${VERSION}
RUN deno compile -o /build/register --allow-env --allow-net https://github.com/shinhwagk/fieldproxy/raw/${VERSION}/register.ts

FROM frolvlad/alpine-glibc:alpine-3.13
WORKDIR /app
COPY --from=0 /build/fp /app/fp
COPY --from=0 /build/register /app/register
ENTRYPOINT ["/app/register", "&&", "/app/fp"]
