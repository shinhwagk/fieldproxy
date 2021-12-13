FROM denoland/deno
ARG VERSION
WORKDIR /build
COPY main.ts .
COPY register.ts .
COPY healthcheck.ts .
RUN deno compile -o /build/fp --allow-env --allow-net main.ts ${VERSION}
RUN deno compile -o /build/register --allow-env --allow-net --unstable register.ts
RUN deno compile -o /build/healthcheck --allow-net healthcheck.ts

FROM frolvlad/alpine-glibc:alpine-3.13
WORKDIR /app
COPY --from=0 /build/fp /app/fp
COPY --from=0 /build/register /app/register
COPY --from=0 /build/healthcheck /app/healthcheck
HEALTHCHECK --interval=5s --timeout=1m CMD /app/healthcheck
ENTRYPOINT ["sh", "-c", "/app/register && /app/fp"]
