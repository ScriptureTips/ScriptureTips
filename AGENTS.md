# ScriptureTips: agent instructions

ScriptureTips is a personal scripture study tool. Users curate **compilations** (their preferred translation, combining verses from several translations and their own wording), study the original languages, link passages, and print or share their work. The social features are an extension that comes later.

**ScriptureTips must never be monetized in any form** (no sales, subscriptions, advertising, sponsorship or donations). Monetizing would forfeit the right to use the NET and other free, non-commercial texts. See [docs/vision.md](docs/vision.md) §1.1. Never propose or build anything that brings money into the platform.

The project is being rebuilt from scratch as this monorepo. The legacy repos alongside it (`../ScriptureTips-*`, `../tex-bible`) are for reference only. See [docs/vision.md](docs/vision.md) §9.

## Status

The monorepo is scaffolded. Built so far: the toolbox, `pnpm verify`, the web app in [`apps/web`](apps/web/AGENTS.md) (landing page, reader view with canon labels, book list and chapter links, credits, sign-in and account page with the canon choice, and the compilation editor with its read, compare and edit modes), the PDF worker in [`apps/pdf-worker`](apps/pdf-worker/AGENTS.md) (Typst in its own container, taking builds from the queue), the API in [`apps/api`](apps/api/AGENTS.md) (translations, passages, accounts with sign-in by one-time email code, and compilations: layered rules by section, book, chapter or passage, single verses, corrections and adaptations, own renderings with authorship evidence, translator's notes, and publishing them as numbered versions read at `/p/{handle}/{slug}`, after an automated license check and consent, with the attributions licenses require; and PDF builds of a compilation, queued for the worker, whose PDFs, `book.json` and Typst sources are kept in the file store), the core packages [`packages/passage`](packages/passage/AGENTS.md), [`packages/versification`](packages/versification/AGENTS.md) (mapping tables generated from TVTMS) and [`packages/reference`](packages/reference/AGENTS.md) (the reference parser), [`packages/canon`](packages/canon/AGENTS.md) (canon profiles: Protestant, Catholic, Orthodox), [`packages/countries`](packages/countries/AGENTS.md) (the list of 250 country codes, from Unicode CLDR, with their names), [`packages/licenses`](packages/licenses/AGENTS.md) (translation license rules as data), [`packages/book`](packages/book/AGENTS.md) (the neutral book description and its Typst templates), [`packages/dialogs`](packages/dialogs/AGENTS.md) (shared alert and confirm dialogs, no dependencies; the extension's settings use them), [`packages/storage`](packages/storage/AGENTS.md) (the S3-compatible file store, Garage in development), [`packages/db`](packages/db/AGENTS.md) (PostgreSQL schema for scripture text, accounts and compilations, migrations, test databases), the translation import and loader in [`tools/scripture-import`](tools/scripture-import/AGENTS.md), the core search widget in [`packages/search`](packages/search/AGENTS.md) (an engine and Lit web components, with the search API in `apps/api`), the original-language data import in [`tools/original-import`](tools/original-import/AGENTS.md) (the Hebrew and Greek words with Strong's numbers and morphology, four lexicons, proper names, and how each translation's Strong's tags align with them), and the source-text converters in [`tools/source-conversion`](tools/source-conversion/AGENTS.md) (JPS 1917, the LEB, and the TVTMS versification import), and scripture links (the study tooltip's *Link*: private passage-to-passage links, created and listed through `/api/links`, from either end) in the API and web app, the website plugin (`packages/scripture-links`, the shared core: finding references in a CSS selector, linking them, the passage tooltip; `apps/widget`, its one-script build with `ScriptureTips.run(selector, options)`; the public `/api/widget` it reads), the browser extension in [`apps/extension`](apps/extension/AGENTS.md) (the rewrite of v1.0.3: page scanning with passage tooltips, the link generator, outside reading sites, turning it off per site, settings carried over from v1.0.3; Chrome and Firefox builds), the deployments for the extension release (the API's `data` role for `scripture.tips` and `ACCOUNTS=closed` for a reader-only `scripturetips.com`, with about, contact, privacy and terms pages; production images in `infra/docker/api` and `infra/docker/web`, Compose files in [`infra/deploy`](infra/deploy/README.md)), the `scripture.tips` site in [`apps/site`](apps/site/AGENTS.md) (home, help for the extension and the website plugin with screenshots, searchable and versioned, downloads, credits, privacy, terms, contact, and the plugin's script; static, read-only, served by Caddy beside the data API), and the PDF engine trial in [`tools/pdf-trial`](tools/pdf-trial/AGENTS.md) (Typst vs LuaLaTeX; results in [docs/pdf-engine-trial.md](docs/pdf-engine-trial.md)). The rest of the stack below is decided but not yet built. Update this file as parts become real.

**Production:** from v1.0.0 (2026-11-15) the websites (`scripturetips.com`, `scripture.tips`) are live and the browser extension depends on them. Treat the API, its data and the sites as running in production: migrations must keep existing data, and changes to the data server's routes (`/widget/`, `/api/widget`) must stay compatible with the released extension and the website plugin.

## Development environment

**Nothing is installed on the host except Docker.** Node, pnpm and every tool run in the toolbox container (`infra/docker/toolbox/`). Never install development software on the host (no `nvm install`, global npm packages or apt packages). If a tool is missing, add it to the toolbox image.

Run every project command through the wrapper, from the repo root:

```bash
./toolbox pnpm install
./toolbox pnpm verify
./toolbox pnpm --filter @scripturetips/passage test
```

The repo is mounted at `/workspace` and commands run as your own user ID, so files stay owned by you. pnpm only installs package versions that have been out for a while (its minimum release age policy). Don't add exceptions to get around it; use an older version instead.

## Docs map

| Doc | Read it when working on |
|---|---|
| [docs/vision.md](docs/vision.md) | Features, principles, tech stack (§7), conventions (§8), delivery order (§10) |
| [docs/domain-model.md](docs/domain-model.md) | Entities, visibility, publishing, versification, data rules |
| [apps/site/AGENTS.md](apps/site/AGENTS.md) | The `scripture.tips` site: help for the extension and plugin, its versioned addresses, caching |
| [docs/testing.md](docs/testing.md) | Test layers, commands, definition of done |
| [docs/book-designer.md](docs/book-designer.md) | Editions and print/PDF output |
| [docs/branding.md](docs/branding.md) | Logo, palette, artwork and its rights, type |
| [docs/licenses.md](docs/licenses.md), [docs/sources.md](docs/sources.md) | Translation and data licensing, ingestion |
| [docs/license-evidence/](docs/license-evidence/) | Captured license terms and file hashes per source |

## Stack (decided)

All TypeScript (6.x: dependency-cruiser and other tools don't support TypeScript 7 yet), Node 24 LTS. pnpm workspaces + Turborepo. NestJS (Fastify) API, Next.js web, PostgreSQL + Drizzle, Valkey + BullMQ, Better Auth, next-intl, Vitest + Playwright, Biome. Docker Compose for development and hosting. Full table: vision.md §7.

## Commands (see testing.md §2)

Run each through `./toolbox`.

- `pnpm verify`: Biome lint and format check, dependency boundaries, spelling, then type-check and tests for the packages affected by the change. **Built.**
- `pnpm verify:full`: the same for every package. **Built.** End-to-end, accessibility, PDF and extension tests are added as those parts are built.
- `pnpm format`: apply Biome formatting, import sorting and safe fixes.
- `./dev up [--lan]` / `./dev down` / `./dev logs` / `./dev migrate` / `./dev site` (rebuilds the `scripture.tips` pages; `up` builds them too): start, stop and follow the local stack, and apply pending database migrations to it (the stack is served through Caddy as https://dev.scripturetips.com and https://dev.scripture.tips, the data server; `--lan` serves them to the local network; `--bind=IP` serves them on that one address and `--local-bind=IP` moves the database and API ports to another loopback address, so other projects can use the same ports beside it, as LanProjectsControlPanel runs it), run on the host (Docker isn't available inside the toolbox). **Agents always start or restart it with `./dev up --lan`**: the project owner tests on a tablet as well. **Built** with PostgreSQL, Valkey, Mailpit (catches outgoing email: http://127.0.0.1:8025, and on the local network with `--lan`), Garage (the file store), the API, the PDF worker and the web app; the other services are added as they're built. `pnpm dev:seed [scenario]` is **planned**. **Run the full Playwright suite with `--workers=1`** (`./toolbox sh -c 'cd apps/web && npx playwright test --workers=1'`, about 17 minutes): the tests share the development stack, and in parallel a different set of unrelated tests fails each run (testing.md §11).

**CI and releases:** Woodpecker (`.woodpecker/`, self-hosted) runs `pnpm verify:full` through `scripts/ci/check.sh` for pushes and pull requests to `main`; tagging `v*` builds and pushes the API, web and site images to the Forgejo registry (`infra/deploy/README.md`, Releases). Never push or deploy `latest`.

**Claude Code hooks** (`.claude/settings.json`, scripts in `scripts/claude-hooks/`): every edited file is formatted with Biome, and `pnpm verify` runs before the agent finishes a turn that changed code. A failure is sent back to the agent to fix.

Markdown isn't formatted by Biome yet (it's excluded in `biome.json`), and cspell doesn't check `docs/` yet.

## Help for the extension and plugins

**Every new or changed feature of the browser extension, the website plugin or `packages/scripture-links` must be documented in the `scripture.tips` help, with screenshots, in the same change** ([apps/site/AGENTS.md](apps/site/AGENTS.md): the topic, the screenshot script, the version folder). It is part of the definition of done below.

## Language

<!-- cspell:ignore colour organise -->

- **UI strings:** New Zealand English ("colour", "organise"). The default locale is `en-NZ`.
- **The `scripture.tips` site (`apps/site`):** US English (`en-US`), the owner's exception for that site.
- **Code, CSS, comments, docs and commit messages:** US English (`color`, `organize`).

## Git

- The project owner runs the git workflow. Agents stage, unstage or commit only when the owner says to, and never push (that needs credentials: give the command instead).
- When a task is done, suggest a commit message with a conventional prefix (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:` …).
- Never carry anything over from the legacy repos' secrets (JWT keys, `.env` files). Treat those keys as compromised.

## Dependencies

Ask before adding any package that isn't already approved. Approved so far: Vitest, Playwright, Biome, the stack listed in vision.md §7, and for accounts: ALTCHA (`altcha`, `altcha-lib`), nodemailer, ioredis and Mailpit; for PDF builds: BullMQ, Garage (the S3-compatible store) and `@aws-sdk/client-s3`. Testing extras waiting for approval are listed in testing.md §9.

## Licensing and sources

- Translation license terms are a first-class domain module (domain-model.md §7). Never hard-code assumptions about a text's permissions.
- **Evidence policy:** whenever a text or data set is obtained, record its terms in `docs/license-evidence/{name}/` with a `SOURCE.md`. Capture the rendered license and download pages as PDF (screen mode), the raw HTML and HTTP headers, any license files in the download, and the file URL, size, date and SHA-256. Never overwrite a capture. Always look at the captured pages.
- The source files live outside git in `../source-texts/`. Their hashes are in `docs/license-evidence/source-files.json` and `SHA256SUMS`. Verify with `sha256sum -c`.
- **Unresolved items go in one place:** [sources.md](docs/sources.md) §8 ("Still open"). That covers open questions, decisions, and captures or downloads that couldn't be completed (blocked sites, dead links). Other docs record only facts and point to the §8 item; don't scatter "try again later" notes through them.
- **When a site blocks automated access, stop and tell the project owner** before working around it. They can open it in their Chrome for the browser tools to read.
- Use only public-domain or openly licensed original-language data. Exclusions are listed in sources.md §4 and §6.

## Definition of done (testing.md §7)

1. Tests added or updated for the behavior, named after the spec section where there is one.
2. `pnpm verify` passes.
3. For UI changes: Playwright screenshots of the changed screens, checked.
3a. For extension and plugin features: the help topic and its screenshots on the `scripture.tips` site (apps/site/AGENTS.md).
3b. A line under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for any change people would notice (features, fixes, security), in US English. When a version is tagged, the owner moves `[Unreleased]` under a new `[x.y.z] - date` heading (the tag, without the `v`).
4. A short report covering what changed, what was tested, anything skipped or weakened and why, and any open questions.
