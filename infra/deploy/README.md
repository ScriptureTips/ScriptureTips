# Production deployment

The two deployments of vision.md §7.2, for the extension release (vision.md §10). The server itself (Docker, the Caddy reverse proxy, firewall, backups, secrets) is set up by the Ansible roles, which run these Compose files.

| File | Site | Runs |
|---|---|---|
| `compose.data.yaml` | `scripture.tips` | PostgreSQL and the API with `API_ROLE=data`: only `/api/widget/*`. Port 8101 on the loopback address. |
| `compose.app.yaml` | `scripturetips.com` (or a satellite) | PostgreSQL, the API with `ACCOUNTS=closed`, and the web app: the reader, landing, about, contact, privacy, terms and credits pages. Port 8102 on the loopback address. |

Each copies its `*.env.example` to a `*.env` file that is never committed (secrets come from Ansible Vault).

## Images

Built from the repository root:

```bash
docker build -f infra/docker/api/Dockerfile -t scripturetips-api:latest .
docker build -f infra/docker/web/Dockerfile -t scripturetips-web:latest .
```

The web image reads `API_URL` when it's built (`http://api:3001/api` by default), so the API's service in `compose.app.yaml` must stay named `api`. `ACCOUNTS` and `CONTACT_EMAIL` are read per request.

## Reverse proxy

- `scripture.tips`: `/api/*` to `127.0.0.1:8101`. Nothing else is served there yet. The proxy must not add cookies.
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
