# Production deployment

The two deployments of vision.md §7.2, for the extension release (vision.md §10). The server itself (Docker, the Caddy reverse proxy, firewall, backups, secrets) is set up by the Ansible roles, which run these Compose files.

| File | Site | Runs |
|---|---|---|
| `compose.data.yaml` | `scripture.tips` | PostgreSQL and the API with `API_ROLE=data`: only `/api/widget/*` (port 8101), and the site's pages and the plugin's script (`apps/site`, port 8103), all on the loopback address. |
| `compose.app.yaml` | `scripturetips.com` (or a satellite) | PostgreSQL, the API with `ACCOUNTS=closed`, and the web app: the reader, landing, about, contact, privacy, terms and credits pages. Port 8102 on the loopback address. |

Each copies its `*.env.example` to a `*.env` file that is never committed (secrets come from Ansible Vault).

## Releases

Tagging a version builds and pushes the images; the Ansible roles pin that exact tag. The pipelines are in `.woodpecker/` and run on the owner's self-hosted Woodpecker (https://ci.antzcode.com), with Forgejo (https://git.antzcode.com) as the git host and registry.

- `check.yaml`: `pnpm verify:full` (lint, boundaries, spelling, types, tests, with a PostgreSQL and a Garage as in `compose.yaml`) for pushes and pull requests to `main`, and for `v*` tags.
- `release.yaml`: for `v*` tags, after `check` passes, builds and pushes the three images below, each tagged with the git tag (`v1.4.0`) and nothing else. Never `latest`.

| Image | Used as |
|---|---|
| `git.antzcode.com/adonai-reigns/scripturetips-api:{tag}` | `API_IMAGE` (`compose.data.yaml`, `compose.app.yaml`) |
| `git.antzcode.com/adonai-reigns/scripturetips-web:{tag}` | `WEB_IMAGE` (`compose.app.yaml`) |
| `git.antzcode.com/adonai-reigns/scripturetips-site:{tag}` | `SITE_IMAGE` (`compose.data.yaml`) |

The PDF worker has no image yet: it runs only when accounts are open (the development stack builds it from `infra/docker/pdf-worker`).

Base images are pinned by version and digest (change both together). The workflow needs the secrets `registry_user` and `registry_token`, and the Woodpecker server must allow `woodpeckerci/plugin-docker-buildx` as a privileged plugin (`WOODPECKER_PLUGINS_PRIVILEGED`). Commit the pipeline before tagging: the tag must point at a commit that contains `.woodpecker/`.

## Images

Built from the repository root:

```bash
docker build -f infra/docker/api/Dockerfile -t scripturetips-api:latest .
docker build -f infra/docker/web/Dockerfile -t scripturetips-web:latest .
docker build -f infra/docker/site/Dockerfile -t scripturetips-site:latest \
  --build-arg CONTACT_EMAIL=… .   # also ST_SITE, ST_DATA, CHROME_STORE_URL, FIREFOX_STORE_URL
```

The web image reads `API_URL` when it's built (`http://api:3001/api` by default), so the API's service in `compose.app.yaml` must stay named `api`. `ACCOUNTS` and `CONTACT_EMAIL` are read per request.

## Reverse proxy

- `scripture.tips`: `/api/*` to `127.0.0.1:8101`, everything else to the site's container (`site` in `compose.data.yaml`, `127.0.0.1:8103`): home, help, downloads, credits, privacy, terms, contact and the plugin's script. The proxy must not add cookies, and must pass the site's `Cache-Control`, `ETag` and `Content-Encoding` through (the cache policy is in `apps/site/site.caddy`; the site container sets it).
- `scripturetips.com`: everything to `127.0.0.1:8102`.

Keep the access logs only as long as they are needed for running and securing the service (the privacy policy promises this without naming a period). Rotate and delete them; don't keep them indefinitely.

## The database

Each stack has its own PostgreSQL. Create the schema with the API image, then load the reference data:

```bash
docker compose -f compose.data.yaml --env-file data.env up -d postgres
docker compose -f compose.data.yaml --env-file data.env run --rm api node /repo/packages/db/src/migrate-cli.ts
```

The scripture text and original-language data are loaded on the owner's machine, where the source files are (`../source-texts/`, outside git), never on the server:

1. On the development stack, create an empty database, migrate it (`DATABASE_URL=… pnpm --filter @scripturetips/db migrate`), and load the translations and the original-language data into it (tools/scripture-import and tools/original-import AGENTS.md).
2. Dump it whole, schema included, so it restores without foreign-key trouble: `pg_dump -Fc -U scripturetips {database} > reference.dump`.
3. Copy the dump to the server and restore it into each stack's empty PostgreSQL with `pg_restore --clean --if-exists -d scripturetips`.

The data server needs only the translations (`translation`, `translation_book`, `verse_text`, and their imports). The app instance's reader also uses the original-language tables for study and search. One dump serves both.

Never copy the development database itself: it holds test accounts and compilations.

## Checking it

- `curl 'http://127.0.0.1:8101/api/widget/passage?translation=leb&ref=Ps.23.1'` answers with the verse, `access-control-allow-origin: *` and no cookie; `/api/translations` is a 404.
- `http://127.0.0.1:8102/read/leb/john/3/16` shows the passage; `/sign-in` is a 404.

Measured on the development machine with the translations loaded: the data stack used about 290 MB of memory, the app stack about 350 MB.
