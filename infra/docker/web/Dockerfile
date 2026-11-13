# The web app (apps/web) for production, as a Next.js standalone server. Built from the
# repository root:
#   docker build -f infra/docker/web/Dockerfile -t scripturetips-web .
# `API_URL` is a build argument: the API's address inside the Compose network. next.config.ts
# bakes it into the proxy rewrites at build time, and the server reads it again at run time
# (src/reader/api.ts), so the final stage sets it too. `ACCOUNTS` and `CONTACT_EMAIL` are read
# per request, so one image serves any instance.
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
RUN npm install -g pnpm@12.15.0
WORKDIR /repo
COPY . .
ARG API_URL=http://api:3001/api
ENV API_URL=${API_URL} NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile --filter "@scripturetips/web..." \
  && pnpm --filter @scripturetips/web exec next build

FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ARG API_URL=http://api:3001/api
ENV API_URL=${API_URL} NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
