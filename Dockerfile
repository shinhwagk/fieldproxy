FROM denoland/deno
WORKDIR /build
COPY VERSION .
COPY main.ts .
RUN deno compile -o /build/fp --allow-env --allow-net main.ts

FROM denoland/deno:alpine-1.16.4
WORKDIR /app
COPY --from=0 /build/fp /app/fp
ENTRYPOINT ["/app/fp"]
