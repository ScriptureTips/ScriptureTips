# Caddy for the development stack (infra/caddy/Caddyfile), with the acme-dns plugin, so it can
# get trusted certificates for the dev sites by the DNS check, through the acme-dns server on
# the VPS (infra/caddy/README.md). Pinned to releases that have been out for a while.
FROM caddy:2.11.7-builder AS build
RUN xcaddy build v2.11.7 --with github.com/caddy-dns/acmedns@v0.7.0

FROM caddy:2.11.7
COPY --from=build /usr/bin/caddy /usr/bin/caddy
