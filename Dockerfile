FROM denoland/deno
ARG VERSION
WORKDIR /build
COPY main.ts .
COPY register.ts .
RUN deno compile -o /build/fp --allow-env --allow-net main.ts ${VERSION}
RUN deno compile -o /build/register --allow-env --allow-net register.ts

FROM frolvlad/alpine-glibc:alpine-3.13
WORKDIR /app
COPY --from=0 /build/fp /app/fp
COPY --from=0 /build/register /app/register
ENTRYPOINT ["/app/register", "&&", "/app/fp"]
