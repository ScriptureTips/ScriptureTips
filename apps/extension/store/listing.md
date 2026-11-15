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

Build from source: the source is the repository `ScriptureTips`; the upload was built with Docker and Node inside the project's toolbox container (nothing else is needed on the host). From the repository root:

    ./toolbox pnpm install
    ./toolbox pnpm --filter @scripturetips/extension build:production
    ./toolbox pnpm --filter @scripturetips/extension package:firefox

The package is written to `apps/extension/dist/packages/scripturetips-<version>-firefox.zip`. The build uses esbuild only (no other bundlers or code generation), and the extension's own code is in `apps/extension/src`, with the shared packages it uses in `packages/scripture-links` and `packages/dialogs`.
