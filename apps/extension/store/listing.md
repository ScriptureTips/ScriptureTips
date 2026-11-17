# Store listing: Scripture Tips (Firefox add-ons, and as a base for the Chrome Web Store)

Text to paste into the add-on's listing. Everything here is checked against the extension's help
(`apps/site/content/en-US/extension/2.0/privacy.html`) and its manifest. If either changes, change
this. Screenshots: `store/screenshots/` (1280 × 800).

## Basics

| Field | Value |
|---|---|
| Name | Scripture Tips |
| Add-on URL (slug) | scripture-tips |
| Homepage | https://scripture.tips/ |
| Support site | https://scripture.tips/contact/ |
| Support email | help@scripturetips.com |
| License | GNU Affero General Public License v3.0 only (AGPL-3.0-only) |
| Privacy policy | https://scripture.tips/privacy/ |
| Categories | Other (first); Social & Communication (second), or the closest on screen |
| Tags | bible, scripture, verse, tooltip, reference, bible study |

## Summary (250 characters at most)

Finds scripture references on the pages you read, links them, and shows the passage in a tooltip when you hover or tap. Choose your translation, pin passages, and link your own writing. Free, with no ads or accounts.

## Description

Scripture Tips turns scripture references on any web page, such as "John 3:16" or "Rom 5:8–10", into links, and shows the passage in a tooltip when you point at one. You read the verse without leaving the page.

**Read a passage in place**
- Point at a reference (or tap it, or reach it with the keyboard) and the passage appears under it.
- "Read more" opens the whole chapter, in the ScriptureTips reader or on the Bible site you prefer.
- Long passages scroll inside the tooltip, with its heading and "Read more" kept in view.

**Your translation, your way**
- Choose the translation for every passage, or change it for one link in its tooltip.
- Public-domain and openly licensed translations, with the credit each publisher asks for shown in the tooltip.

**Keep passages open**
- Pin a tooltip and it stays while you write a reply, scroll, or type elsewhere. Pin as many as you like.

**Send links to the site you prefer**
- BibleGateway.com, BibleHub.com and BlueLetterBible.org come with it. Add, edit and reorder your own sites in the settings.

**Link your own writing**
- The link generator takes what you are writing and links every reference in it, as HTML, BBCode (forums), wiki markup or Markdown, with undo and redo.

**In your control**
- Turn it off for any site with one switch in the toolbar.
- Make the tooltip text larger or smaller.
- Nothing is sent about the page you are on. Only when you open a tooltip does it ask for that one passage. See the privacy policy below.

**Free, always.** Scripture Tips has no advertising, no subscriptions and no purchases. It will not be monetized in any form.

Help and details: https://scripture.tips/

## Screenshot captions

1. `1-passage-tooltip.png`: A passage in a tooltip, on any web page.
2. `2-translations-and-pins.png`: Choose a translation for each passage, and pin passages to keep them open.
3. `3-link-generator.png`: The link generator links the references in your own writing, for forums, wikis, Markdown and HTML.
4. `4-settings.png`: Settings: where links go, your translation, and the sites it is turned off on.

## Notes to reviewers

What it does: finds scripture references (for example "John 3:16") in the text of the pages the user visits, makes them links, and shows the passage in a tooltip on hover, tap or keyboard focus.

Why it runs on all sites: references appear on any website, so the content script matches `<all_urls>`. It leaves out Google's pages, as version 1.0.3 did, and the ScriptureTips sites themselves.

What leaves the browser: only when the user opens a tooltip, the extension requests that passage from `https://scripture.tips/widget/...`. The request carries the reference (such as "John.3.16") and the translation, and nothing else: not the page's address, not other text from the page, and no cookies. The settings page also requests the list of translations. Finding references on a page happens locally and sends nothing. Because that request carries a piece of the page's text, the manifest declares `data_collection_permissions: { required: ["websiteContent"] }` (that is Mozilla's definition of website content, even though only the reference is sent).

Permissions: `storage` keeps the settings and the translation chosen for each link (on the device, in the extension's own storage; never in the visited site's storage). `activeTab` lets the toolbar popup read the current tab's address to show its site name, turn the extension off for that site, and open the link generator on that page. There is no remote code, no `eval`, and no analytics or advertising of any kind.

Where it keeps its state: the extension's own storage only. The visited site's `localStorage` is never used.

How to test: install it, open any page with references (for example a Bible study blog, or a page that says "Romans 5:8 and John 3:16"), and point at a reference. The toolbar button opens a popup with a switch for the current site, the link generator, and the settings. No account or sign-in is needed.

Build from source. The source is the tag https://github.com/ScriptureTips/ScriptureTips/releases/tag/v1.0.0 (also uploaded here as the source archive, `scripturetips-v1.0.0-source.zip`). The extension is the folder `apps/extension`; the monorepo around it holds the website and API, which are not part of the package.

Environment (the versions the upload was built with):
- Operating system: Linux. The upload was built in a Debian 12 container (`node:24.22.1-bookworm-slim`, `infra/docker/toolbox/Dockerfile`), which is what pins these versions; the steps below need only Node and pnpm.
- Node.js 24.22.1 (any 24.x from 24.22.1; `engines` in the root `package.json`).
- pnpm 12.15.0 (`packageManager` in the root `package.json`). With Node installed: `npm install -g pnpm@12.15.0`.
- esbuild 0.25.12 and web-ext 10.x are installed by `pnpm install` from `pnpm-lock.yaml`; no other program is needed.

Steps, from the top folder of the unpacked archive:

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @scripturetips/extension build:production` (the build script is `apps/extension/build.ts`; it writes the unpacked add-on to `apps/extension/dist/firefox`)
3. `pnpm --filter @scripturetips/extension package:firefox` (zips it to `apps/extension/dist/packages/scripturetips-2.0.0-firefox.zip`)

(The project's own way of building runs the same commands inside a Docker container, `./toolbox pnpm …`, so nothing is installed on the developer's computer. Reviewers don't need it: it also starts databases the extension doesn't use.)

4. Compare `apps/extension/dist/firefox` with the uploaded package, file by file (zip timestamps differ).

`build:production` builds for the real addresses: the reader `https://scripturetips.com` and the data server `https://scripture.tips`. The build uses esbuild only (no other bundler or code generator, nothing downloaded at build time besides the packages in `pnpm-lock.yaml`). The extension's own code is `apps/extension/src`; the two shared packages it uses are `packages/scripture-links` and `packages/dialogs`. The extension's version comes from `apps/extension/package.json`; nothing in the build depends on the date or the git history.

# Chrome Web Store (an update of the v1.0.3 listing)

Package: `apps/extension/dist/packages/scripturetips-2.0.0-chrome.zip` (`build:production`, then
`package:chrome`). Version 2.0.0 is above v1.0.3's; the permissions (`storage`, `activeTab`) are
no more than v1.0.3 had, so Chrome doesn't switch the update off for existing users.

Short description (the manifest's, 132 characters at most, set in `_locales/en/messages.json`):
"Recognises scripture references on the pages you read, links them, and shows the passage when you hover or tap."

Promotional images (the existing ones are dark and dated): `store/promo-small-440x280.jpg` (small tile) and `store/promo-marquee-1400x560.jpg` (marquee, optional), made by `apps/site/shots/store.shots.ts`: the logo, the name and a plain line on pale sky blue, no clouds artwork (its CC BY-NC credit wouldn't fit).

The store listing (description, screenshots, categories) is the text above. Screenshots: the four
in `store/screenshots/` (1280 × 800).

## Privacy practices tab

- **Single purpose:** Finds scripture references on the web pages the user reads, links them, and shows the passage in a tooltip.
- **`storage` justification:** Keeps the user's settings (where links go, translation, format, sites turned off) and the translation chosen for each link, in the extension's own storage.
- **`activeTab` justification:** The toolbar popup reads the address of the current tab to show its site name, turn the extension off for that site, and open the link generator on that page.
- **Host permission (`<all_urls>`, the content script) justification:** Scripture references can appear on any website, so the content script must read the text of any page to find them. It only finds references locally; nothing is sent until the user opens a tooltip, and then only that one reference and translation are requested from `https://scripture.tips`. It leaves out Google's pages and the ScriptureTips sites.
- **Remote code:** No. All code is in the package; there is no `eval` and nothing is loaded from a server.
- **Data usage:** check **Website content** (the reference taken from the page, such as "John 3:16", is requested from the data server when a tooltip opens) and **Location** (the data server records each request's IP address, as the privacy policy says). Leave every other category unchecked. Check all three certifications.
- **Privacy policy URL:** https://scripture.tips/privacy/

## Test instructions (Chrome Web Store, 500 characters at most)

The text is in `store/test-instructions.txt` (about 470 characters). The test page is the demo
`jonah.html` hosted at https://www.adonai-reigns.life/demo/ (not linked from anywhere; it says it
is AI generated and carries `noindex`).
