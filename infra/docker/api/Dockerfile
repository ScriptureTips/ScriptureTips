# The API (apps/api) for production: an app instance (`API_ROLE=app`, with `ACCOUNTS` open or
# closed) or the data server (`API_ROLE=data`, vision §7.2). Built from the repository root:
#   docker build -f infra/docker/api/Dockerfile -t scripturetips-api .
# Workspace packages run from their TypeScript source, so they stay at their own paths (outside
# node_modules, where Node won't strip types); only the API itself is compiled.
FROM node:24.22.1-bookworm-slim AS base
RUN npm install -g pnpm@12.15.0
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@scripturetips/api..." \
  && pnpm --filter @scripturetips/api build

# Only the API's runtime dependencies, linked as in the workspace.
FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter "@scripturetips/api..."

FROM node:24.22.1-bookworm-slim
ENV NODE_ENV=production PORT=3001
WORKDIR /repo
COPY --from=deps /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY --from=deps /repo/apps/api ./apps/api
COPY --from=build /repo/apps/api/dist ./apps/api/dist
USER node
WORKDIR /repo/apps/api
EXPOSE 3001
# Migrations: `docker compose run --rm api node /repo/packages/db/src/migrate-cli.ts`.
CMD ["node", "dist/main.js"]
