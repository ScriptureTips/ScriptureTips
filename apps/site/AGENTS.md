# @scripturetips/site

The `scripture.tips` site (vision §7.2): home, help (`/about/`), downloads, credits, privacy, terms and contact, with the website plugin's script at `/widget/scripturetips.js`. **Read-only, no sign-in, no cookies.** It mirrors the branding of scripturetips.com (palette, artwork on a paper panel: `src/styles.css`). Static files, built into `dist/` and served by Caddy next to the API's `/api/widget/*` routes. It is not part of `apps/web`, whose pages render per request.

## The help is part of every extension and plugin feature

**Any new or changed feature of the extension, the website plugin or `packages/scripture-links` is not done until its help is written here, with screenshots** (testing.md §7). A feature that changes how a released version behaves goes in the next version's folder, never into the released one (below).

1. Write or update the topic: `content/en-US/{product}/{version}/{id}.html`, listed in that folder's `topics.json` (title, one-sentence summary, search keywords). Document only what's built, in the words the interface really shows (quote its labels).
2. Add the screenshot to `shots/{product}.shots.ts`, which drives the real extension (loaded unpacked) or the built plugin against the dev stack. Each shot is cropped to its topic, with the control ringed (`capture` in `shots/support.ts`), at 2x. Run it: `./toolbox sh -c 'cd apps/site && npx playwright test --config playwright.shots.config.ts'` after building the extension and the widget (`./dev up --lan` first). Look at every image you change. The PNGs are committed.
3. Reference it as `<img src="images/name.png" alt="what it shows">` (alt text is required; the build adds size and lazy loading). Link topics with `<a href="topic:id">`.
4. `./dev site` rebuilds the site; `pnpm --filter @scripturetips/site test` and `e2e` check it (broken links, missing screenshots and headings, caching).

## Versions and addresses (a contract: the products' help links use them)

- `/about/{product}/{version}/{topic}/` is that version's topic for good. `{version}` is two numbers (`2.0`): a full version redirects to it (`/about/extension/2.0.7/pin/` → `2.0`, 308).
- `/about/{product}/{topic}/` is the current (newest) version's; `/about/{product}/` its contents; `/about/` every product's.
- A version newer than the help published redirects (302) to the current help.
- **Topic ids are never renamed or reused** for something else: help icons and links in released versions name them. A topic a later version drops stays in the older version's folder.
- **A released version's folder is frozen**, apart from corrections (wording, a broken link, a replaced screenshot). When the extension or plugin version's first two numbers change (`apps/extension/package.json`, `apps/widget/package.json`), copy the folder to the new version, then edit the copy: `site.test.ts` fails until the product's current version has help. Old versions show a notice and `noindex`.
- The plugin is at 1.0.0 (its `package.json` had no version until now). Help for the extension's v1.0.3 isn't written.

## Performance and caching (`site.caddy`, the one source for the dev stack and `infra/docker/site`)

- Everything under `/assets/` (CSS, search script and indexes, screenshots, logo, artwork) is named with a hash of its bytes: `immutable`, one year. Never link a file there by a name that isn't built.
- Pages: `max-age=300, stale-while-revalidate=86400`, with an ETag (a 304 when unchanged), because pages keep their addresses while words change. The plugin's script: one hour.
- Each text file gets Brotli and gzip copies at build time. No cookie is ever set; the content security policy allows only the site's own files.
- No third-party requests, no fonts, no framework: the pages are HTML and one small search script. Keep it so.

## Search

A build-time index per product version (`assets/search-{product}-{version}.{hash}.json`: titles, keywords, headings, text), fetched when the reader first uses the box and searched in the browser (`src/search.ts`, `src/client/search.ts`). Nothing typed is sent. `/about/?q=…` searches on arrival. Without JavaScript the box is hidden and the contents lists still work.

## Settings (environment at build time; the pages are static)

`ST_SITE` (the reader, `scripturetips.com`), `ST_DATA` (this site), `CONTACT_EMAIL` (`contact@scripture.tips` in the image and the dev build; no contact page if empty), `CHROME_STORE_URL` and `FIREFOX_STORE_URL` (named on the downloads page once they exist; never invent a listing). The production image takes them as build arguments (`infra/docker/site`).

## Language

**US English** (en-US) for this site, an exception to the product's NZ English interface (the owner's decision for `scripture.tips`). Content is under `content/en-US/`; another language gets a folder beside it and `/{locale}/…` addresses (not built: only `en-US` is published). Quote the extension's and plugin's own labels as they appear, even where they're NZ English.

## Layout

`src/content.ts` (loads and checks the content), `fragment.ts` (settings, topic links, images, heading ids), `site.ts` (every file of the site), `search.ts`; `build.ts` (writes `dist/`, takes the plugin's script from `apps/widget/dist`); `shots/` (screenshots); `e2e/` (against the dev stack); `site.caddy`.

Privacy and terms are drafts for the owner's review (as the web app's are).
