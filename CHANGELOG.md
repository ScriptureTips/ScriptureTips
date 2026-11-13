# Changelog

What changed in ScriptureTips, newest first, in terms of what people can do. Format after [Keep a Changelog](https://keepachangelog.com/). The browser extension and the website plugin each have their own version (`apps/extension/package.json`, `apps/widget/package.json`); their help is on scripture.tips, versioned the same way.

The platform's version is its git tag, `vMAJOR.MINOR.PATCH`. Tagging builds the API, web and site images under that tag, and production pins it (`infra/deploy/README.md`, Releases). Entries from before v0.0.1 are dated instead.

## [Unreleased]

## [0.0.1] - 2026-11-14

The first tagged version: the extension release.

### Added
- The `scripture.tips` site (`apps/site`): home, downloads, credits, privacy, terms and contact pages, and searchable help for the browser extension and the website plugin, with screenshots. Help addresses are versioned: `/about/{product}/{version}/{topic}/` stays accurate for that version, and `/about/{product}/{topic}/` is the current one.
- The website plugin is served at `/widget/scripturetips.js` and now has version 1.0.0.
- A production image for the site (`infra/docker/site`) and a `site` service in `infra/deploy/compose.data.yaml`.
- `./dev site` rebuilds the site's pages.
- `scripts/reference-dump.sh` builds the reference data dump (translations and original-language data) that production's database is restored from.
- A Woodpecker pipeline (`.woodpecker/`): the checks for every push and pull request to `main`, and on a `v*` tag, once they pass, the API, web and site images pushed to the Forgejo registry under that tag.

### Fixed
- The reader and the home page's translation picker were empty on scripturetips.com: the web image didn't pass the API's address to its server, which then looked for the API on its own loopback. The address is now set in the image, and is also the code's default.
- The JPS 1917 conversion test no longer crashes where the source texts are absent; it skips as intended.

### Changed
- The plugin's links open the site named by `ST_SITE` instead of the server the script was loaded from.

## 2026-11-11

### Added
- Release setup for the extension: a reader-only `scripturetips.com` (about, contact, privacy and terms pages), the `scripture.tips` data server, production images and Compose files, and the extension's split addresses.
- The dev stack is served through Caddy, with Let's Encrypt certificates through acme-dns on the VPS.

## 2026-11-09 to 2026-11-10

### Added
- Browser extension 2.0, rebuilt on the shared `scripture-links` core: passage tooltips, links marked with the logo, a settings page with the artwork, logo and credits.
- The passage tooltip can be pinned open while you write elsewhere on the page.
- The API's `data` role for `scripture.tips`.

## 2026-11-08

### Added
- The website plugin: passage popups with a translation choice per link.
- *Link* in the study tooltip: private passage-to-passage links with the selected words quoted, highlighted on hover, and clickable.
- The search widget's default pick shows the passage.

### Fixed
- The tooltip closing after *Link* on phones; link highlights on Firefox for Android.

## 2026-10-31 to 2026-11-01

### Added
- Study mode: select words to see what they are, how they're used and their dictionary entries, in a floating window that can minimize to a bar.
- The original-language data (Hebrew and Greek words, Strong's numbers, morphology, lexicons, proper names), credited as its licenses require.
- The core search widget, on the home page and in the study window, with a search API for references, verse text and original-language words.
- Favorite translations with drag-and-drop ordering; a redesigned profile page and a user menu.
- Compilations as cards, started from a dialog; a 404 page.
- Buttons for the verses around a passage and for the whole chapter.

### Fixed
- The home search field no longer appears late.

## 2026-10-29 to 2026-10-30

### Added
- Compilations: layered translation choices by section, book, chapter or passage, single-verse choices, corrections and adaptations, own renderings with authorship evidence, and translator's notes.
- Publishing a compilation as numbered, hash-chained versions at `/p/{handle}/{slug}`, after an automated license check and consent, with the attributions licenses require.
- PDF builds of a compilation, rendered by a Typst worker.
- The compilation editor: read, compare and edit modes, in-place wording changes, a phone layout.

### Changed
- Dates are shown in the reader's own time zone; the system keeps UTC.

## 2026-10-28

### Added
- The reader, with translator's notes, a landing page and credits; book list in canon order with previous and next chapter links.
- Accounts with one-time email codes (no passwords), and canon profiles (Protestant, Catholic, Orthodox) chosen on the account page.
- The NestJS API for translations and passages, the PostgreSQL schema, and imports of the BSB, JPS, NET, RV and LEB texts.

### Security
- Next.js, nodemailer and NestJS upgraded for security advisories.

[Unreleased]: https://git.antzcode.com/adonai-reigns/ScriptureTips/compare/v0.0.1...HEAD
[0.0.1]: https://git.antzcode.com/adonai-reigns/ScriptureTips/releases/tag/v0.0.1
