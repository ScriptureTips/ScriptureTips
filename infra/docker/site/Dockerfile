# The scripture.tips site (apps/site) for production: its pages as plain files, served by Caddy
# under the rules in apps/site/site.caddy (the cache policy is part of the image). Built from the
# repository root:
#   docker build -f infra/docker/site/Dockerfile -t scripturetips-site \
#     --build-arg CONTACT_EMAIL=… .
# Everything the pages say about this deployment is fixed when the image is built.
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
RUN npm install -g pnpm@12.15.0
WORKDIR /repo
COPY . .
# The reader the pages and the website plugin's links open, and this site's own address.
ARG ST_SITE=https://scripturetips.com
ARG ST_DATA=https://scripture.tips
# The contact page's address (no contact page without it), and the extension's store listings
# (named on the downloads page once they exist).
ARG CONTACT_EMAIL=help@scripturetips.com
ARG CHROME_STORE_URL=
ARG FIREFOX_STORE_URL=
ENV ST_SITE=${ST_SITE} ST_DATA=${ST_DATA} CONTACT_EMAIL=${CONTACT_EMAIL} \
  CHROME_STORE_URL=${CHROME_STORE_URL} FIREFOX_STORE_URL=${FIREFOX_STORE_URL}
RUN pnpm install --frozen-lockfile --filter "@scripturetips/site..." --filter "@scripturetips/widget..." \
  && pnpm --filter @scripturetips/widget build \
  && pnpm --filter @scripturetips/site build

FROM caddy:2.11.7@sha256:36c24ad91a7ff7bc4c87fe22bfa8df3c4b18da0773d73fc12ee2c52b98c0bb7e
COPY infra/docker/site/Caddyfile /etc/caddy/Caddyfile
COPY apps/site/site.caddy /etc/caddy/site.caddy
COPY --from=build /repo/apps/site/dist /srv
EXPOSE 8080
