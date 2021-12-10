FROm denoland/deno
WORKDIR /build
RUN deno compile -o fp --allow-env --allow-net main.ts

FROM denoland/deno:alpine-1.16.4
WORKDIR /app
COPY --from=0 /build/fp ./
ENTRYPOINT ["/app/fp"]
