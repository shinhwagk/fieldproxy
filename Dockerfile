FROM denoland/deno
ARG VERSION
WORKDIR /build
COPY main.ts .
RUN deno compile -o /build/fp --allow-env --allow-net main.ts ${VERSION}

FROM frolvlad/alpine-glibc:alpine-3.13
WORKDIR /app
COPY --from=0 /build/fp /app/fp
ENTRYPOINT ["/app/fp"]
