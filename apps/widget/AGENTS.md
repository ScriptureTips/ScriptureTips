# @scripturetips/widget

The website plugin (vision §3.6): the drop-in script a site owner adds, built from `@scripturetips/scripture-links` into one minified file that declares `window.ScriptureTips`.

```html
<script src="https://scripture.tips/widget/scripturetips.js" async></script>
<script>
  ScriptureTips.run("#main-content", { translation: "eng-kjv" });
</script>
```

- **API** (`src/main.ts`): `run(selector, options?)` (the options are read the first time; `api` and `site` default to where the script came from; see `LinksOptions`), `setPreferences({ translation })` (the visitor's own default, for a site with accounts: used after the reader's own choice for a passage, the link's address and an abbreviation written after the passage, and before the configured default), `rescan(element?)`, `on(event, handler)` (`tooltip-open`, `translation-change`, `scan`; returns a function that stops listening). Calls made before `run` are kept until it.
- **Search (1.1):** `search(options)` and zero-configuration markup (`<div class="st-search">`, `data-st-input`/`data-st-results`) put a search on the page; the code is a second file, `scripturetips-search.js`, loaded from beside the main script only when the page has one (`src/search.ts`; the main script stays free of Lit: `bundle.test.ts` checks both budgets). It reads `/api/widget/search`, `/suggest` and `/passage` of the data server (CORS `*`, no cookies). The core is `packages/search/src/embed.ts`; the help is the Search section of the 1.1 help, with live demos (`demo/demo.js`, served at `/widget/demo.js`). A picked passage opens the reader (`st-reader`: chapter bar, book and translation pickers, context links) from `packages/search`. New search behavior goes in `packages/search`, not here. Planned: developer tokens (`token` option, vision §7.2).
- **Privacy and weight:** no cookies; passage requests only (`credentials: "omit"`); the only thing stored is the reader's own translation choice for each link, in the page's `localStorage` on their browser, never sent anywhere, written only when they choose. `bundle.test.ts` holds the script to a size budget (45 KB minified; 33 KB when written) and checks that the versification tables, the server and the web app stay out.
- **Build:** `./toolbox pnpm --filter @scripturetips/widget build` writes `dist/scripturetips.js` and copies it to `apps/web/public/widget/` (not in git). **`scripture.tips` serves it at `/widget/scripturetips.js`**: `apps/site`'s build takes `dist/scripturetips.js`. `ST_SITE` at build time sets the reader its links open (the data server has no reader; the dev stack's if not given), as for the extension. Version 1.1.0 (search added; 1.0.0 had only the links); the build also writes `scripturetips-search.js` and the site takes both, plus `demo/demo.js`; the help is versioned by its first two numbers. The end-to-end tests need it built first. esbuild is a dev dependency.
- **Not built yet:** the WordPress plugin (a thin wrapper that adds this script), serving the script from a CDN with versioned names, and the site-wide configuration from the site's ScriptureTips account settings.

**Help:** every feature built here is documented, with screenshots, on the `scripture.tips` site before it is done (`apps/site/AGENTS.md`: topic, screenshot script, version folder). Its topics are what a later in-extension help icon will link to, so a topic's id never changes.

Tests: `./toolbox pnpm --filter @scripturetips/widget test`; the behavior in a browser is `apps/web/e2e/widget.spec.ts`.
