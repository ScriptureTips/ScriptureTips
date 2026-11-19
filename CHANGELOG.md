# Changelog

What changed in ScriptureTips, newest first, in terms of what people can do. Format after [Keep a Changelog](https://keepachangelog.com/). The browser extension and the website plugin each have their own version (`apps/extension/package.json`, `apps/widget/package.json`); their help is on scripture.tips, versioned the same way.

The platform's version is its git tag, `vMAJOR.MINOR.PATCH`. Tagging builds the API, web and site images under that tag, and production pins it (`infra/deploy/README.md`, Releases). Entries from before v0.0.1 are dated instead.

## [Unreleased]

## [1.1.0] - 2026-11-20

### Changed
- The reader's books and translations are a horizontal menu: Old Testament, New Testament and Other scriptures, each a dropdown of its books. The passage is edited in the blue chapter bar (the pencil beside the book and chapter), and the Translation dropdown sits under the bar, to the right. The menu fits on one line on a phone.
- The reader shows several translations at once: the passage is stacked under each one's name, with its own credit. Translation is a list you tick (one always stays on, and the address keeps your choice in `?with=`); signed in you can show up to 40, and a guest up to 6.
- The Translation list shows your compilations and favorites, and the other translations under a heading that opens and closes (the choice is remembered in the browser; closing it turns those translations off). Checkboxes in its footer select or deselect a whole group. A long name is clipped to one line and opens out when hovered.
- The home page search always covers every translation: the translation list is gone. A passage opens in your first favorite translation, and a verse found by its words opens in the translation it was found in. The field and button are narrower on a wide screen.
- The translation list, a translation's books and its passages can be kept by browsers and caches (they were not cacheable before).

### Added
- The previous and next chapter arrows in the reader's bar say which chapter they go to when hovered, and a spinner shows (and the text dims) while another chapter or other translations load.
- Search keeps every word of a "quoted phrase" ("money is the root of all evil"), and leaves out only "the", "a", "of" and "and" from a plain search; small words like "before" count.
- The search results scroll on without end: the next verses load as you reach the bottom of the list, on the home page and in the study window.
- Search lists a verse once, not once for every translation that has it, so a limited list reaches more verses.
- Search keeps small words you type ("shoot before") and lists the verses where your words sit closest together first.
- Search finds a verse by words spread across translations (one translation has one word, another has the other), shows each translation's words, and lists near matches after the full ones, saying which word is missing.
- Study mode works in a compilation's Read tab too: the words are marked, and selecting them opens the same tooltip (what they are, dictionary, search, links).

## [1.0.0] - 2026-11-15

The first production release: the websites (`scripturetips.com` and `scripture.tips`) are live from here on, because the browser extension depends on them.

### Changed
- A long passage in a tooltip scrolls inside it: the reference, translation menu, pin and *Read more* stay in view (extension and website plugin).
- *Read more* in a passage's tooltip goes to the chosen outside reading site (not always the ScriptureTips reader), with the site's name beside it.
- The link generator's page (where it opens in a tab) has the same brand and layout as the settings page: the artwork behind a panel, the logo beside the heading, and the artwork's credits.
- The extension's settings show the sites it is turned off on as cards (a heading each, edited by clicking it, a red × that asks first), always in alphabetical order, instead of a text box with one site per line. A whole address typed in is cut down to its site.
- The extension's settings start with **Defaults** (where links go, the translation, and the link generator's format), then the sites turned off. The outside reading sites are edited in a window opened by the pencil beside "Where links go". The ScriptureTips address is under **Advanced settings**, closed until opened.
- The extension's settings show the outside reading sites as cards in full-width rows: the name as the title (only as wide as its words, and growing as you type) with a short translation menu beside it, the address below, and a red round × to remove it, which asks in a dialog first (Remove or Cancel; Esc or a click outside cancels). The cards can be put in order by dragging their handles (or with the arrow keys). Names and addresses are edited where they stand, by clicking or tapping them.
- The browser extension's toolbar popup shows the logo beside its heading, turns the extension on or off for the current site with a slide switch beside the site's name (green and right is on, red and left is off) instead of a checkbox, and leads to the link generator and the settings with two square 80px buttons. The link generator now opens as a window on the page you're on, which you can drag by its title bar and resize by its corner (it remembers where you left it), instead of a new tab; on pages the extension can't open it on, it still opens in a tab. In HTML, the links it makes open in a new tab. "Links go to" has its own line, with a cog beside it that opens the settings.

### Added
- Any number of passage tooltips can be pinned on a page (extension and website plugin): while some are pinned, other references open their own tooltip, and only one tooltip that isn't pinned is ever open.
- The extension has a round ? beside some fields (where links go and the ScriptureTips address in the settings, and the format in the link generator) that explains them in a dialog.
- The browser extension's toolbar popup has a footer with magnifying glasses to make the text of the passage tooltips larger or smaller (85% to 200%). The page's own text and the popup itself are unchanged, and the size is kept per browser. Help: "Making the text larger or smaller".

### Fixed
- Passage tooltips no longer pick up a website's styles: their text is a fixed 15 pixels in the tooltip's own font stack, and no page rule can restyle, hide or move them. In the browser extension, not even a site's `--st-*` theme variables apply; the website plugin still honors them.
- Searching for a range of verses, such as John 3:16-17, now previews every verse of the range, not only the first.
- Picking a passage in the home page's search goes straight to the reader, without first loading the passage into the search field.
- "Jude 1", "2 John 1" and the other one-chapter books (Obadiah, Philemon, 3 John) now show the whole book, not only verse 1. Verse 1 is "Jude 1:1".

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

[Unreleased]: https://git.antzcode.com/adonai-reigns/ScriptureTips/compare/v1.0.0...HEAD
[1.0.0]: https://git.antzcode.com/adonai-reigns/ScriptureTips/compare/v0.0.1...v1.0.0
[0.0.1]: https://git.antzcode.com/adonai-reigns/ScriptureTips/releases/tag/v0.0.1
