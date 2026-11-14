import {
  type BrowserContext,
  test as base,
  chromium,
  expect,
  type Page,
  type Worker,
} from "@playwright/test";
import { shot } from "./support.ts";

/**
 * The browser extension (vision §3.6, testing.md "Browser extension"), loaded unpacked into
 * Chromium from `apps/extension/dist/chrome` (built by `pnpm --filter @scripturetips/extension
 * build`). Pages on another origin are answered here; passages come from the dev stack through the
 * extension's background, from the dev data server (`dev.scripture.tips`).
 */
const EXTENSION = new URL("../../extension/dist/chrome", import.meta.url).pathname;
const FIXTURE = "https://fixture.test/";
/** The small logo the extension puts after its links (its own file, by extension URL). */
const MARK = /^url\("chrome-extension:\/\/[a-p]{32}\/mark\.png"\)$/;
const WIDGET = "https://dev.scripturetips.com/widget/scripturetips.js";

const test = base.extend<{ context: BrowserContext; worker: Worker; extensionId: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures it needs from here.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
        // The background's requests go to the dev stack's self-signed certificate.
        "--ignore-certificate-errors",
        "--disable-features=LocalNetworkAccessChecks",
      ],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const [worker] = context.serviceWorkers();
    await use(worker ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  page: async ({ context }, use) => {
    await use(await context.newPage());
  },
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright needs the fixtures argument destructured.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Extensions run in desktop Chromium.");
});

const page$ = (body = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Fixture page</title><style>body { font: 18px/1.5 serif; margin: 1rem; }</style></head><body>
<main id="content">
  <p>As Paul says in Romans 5:8, and John 3:16 too.</p>
  <p>Already <a href="/elsewhere">Genesis 1:1</a> is a link.</p>
  <p><code>Psalm 23</code> is in code.</p>
  <textarea>John 1:1</textarea>
  ${body}
</main></body></html>`;

async function open(page: Page, html = page$()) {
  await page.route(`${FIXTURE}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await page.goto(FIXTURE);
}

/** Sets what the extension keeps in sync storage, from its background. */
async function store(worker: Worker, items: Record<string, unknown>, clear = false) {
  await worker.evaluate(
    async ([items, clear]) => {
      const sync = (
        globalThis as unknown as {
          chrome: {
            storage: {
              sync: { clear(): Promise<void>; set(i: Record<string, unknown>): Promise<void> };
            };
          };
        }
      ).chrome.storage.sync;
      if (clear) {
        // The install step saves the settings first: wait for it, so it can't overwrite these.
        // (On the real update, it's what carries v1.0.3's keys over.)
        const get = (sync as unknown as { get(k: string): Promise<Record<string, unknown>> }).get;
        for (let i = 0; i < 50 && !("settings" in (await get.call(sync, "settings"))); i++)
          await new Promise((r) => setTimeout(r, 100));
        await sync.clear();
      }
      await sync.set(items);
    },
    [items, clear] as const,
  );
}

const tooltip = (page: Page) => page.getByRole("dialog", { name: "Scripture passage" });

test("vision §3.6: the extension links references on any page, and leaves links, code and fields", async ({
  page,
}) => {
  await open(page);
  const links = page.locator("#content a.st-ref");
  await expect(links).toHaveText(["Romans 5:8", "John 3:16"]);
  await expect(links.first()).toHaveAttribute("data-st-owner", "extension");
  await expect(links.first()).toHaveAttribute(
    "href",
    "https://dev.scripturetips.com/read?t=eng-kjv&ref=Romans%205%3A8",
  );
  await expect(page.locator('a[href="/elsewhere"] a, code a')).toHaveCount(0);
  expect(await page.locator("textarea").inputValue()).toBe("John 1:1");
});

test("vision §3.6: hovering shows the passage, fetched by the extension, with nothing kept on the page's site", async ({
  page,
  worker,
}) => {
  await open(page);
  await page.locator("a.st-ref", { hasText: "John 3:16" }).hover();
  const pop = tooltip(page);
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("For God so loved the world");
  // The shared tooltip's pin is here too (widget.spec.ts tests how it behaves).
  await expect(pop.getByRole("button", { name: "Keep open" })).toBeVisible();
  await page.screenshot(shot("extension-tooltip"));
  // The choice of translation is kept by the extension, not in the site's storage.
  await pop.getByRole("combobox", { name: "Translation" }).selectOption({ label: "LEB" });
  await expect(pop).toContainText("Lexham English Bible");
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  const kept = await worker.evaluate(async () =>
    (
      globalThis as unknown as {
        chrome: { storage: { local: { get(k: string): Promise<Record<string, unknown>> } } };
      }
    ).chrome.storage.local.get("choices:fixture.test"),
  );
  expect(String(kept["choices:fixture.test"])).toContain("leb");
});

test("vision §3.6: the demo blog entry on the dev stack is linked by the extension alone", async ({
  page,
}) => {
  // dev.scripture.tips/demo (apps/extension/demo): a page with no ScriptureTips script.
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/widget/") || r.url().includes("scripturetips.js")) scripts.push(r.url());
  });
  await page.goto("https://dev.scripture.tips/demo/jonah.html");
  const links = page.locator("article a.st-ref");
  await expect.poll(() => links.count()).toBeGreaterThanOrEqual(60);
  // Every link is the extension's, and each reference is linked once.
  await expect(page.locator('a.st-ref:not([data-st-owner="extension"])')).toHaveCount(0);
  await expect(page.locator("a.st-ref a, a a.st-ref")).toHaveCount(0);
  // What it leaves alone: the author's own link, code, and a field.
  await expect(page.locator('a[href="#commentary"]')).toHaveText("Matthew 12:40");
  await expect(page.locator("pre a, code a, textarea a")).toHaveCount(0);
  expect(await page.locator("textarea").inputValue()).toBe(
    "I think you could also mention John 1:1 here.",
  );
  // A reference written with its translation, "John 3:16 (KJV)", shows that one.
  await page.locator("a.st-ref", { hasText: "John 3:16" }).hover();
  await expect(tooltip(page)).toContainText("For God so loved the world");
  await page.screenshot(shot("extension-demo-jonah"));
  expect(scripts).toEqual([]);
});

test("vision §3.6: on a page with a strict content security policy, the tooltip still works and is styled", async ({
  page,
}) => {
  await page.route(`${FIXTURE}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: {
        "content-security-policy": "default-src 'self'; style-src 'self'; script-src 'self'",
      },
      body: page$(),
    }),
  );
  await page.goto(FIXTURE);
  const link = page.locator("a.st-ref", { hasText: "John 3:16" });
  await link.hover();
  const pop = tooltip(page);
  await expect(pop).toBeVisible();
  // Passages are fetched by the extension, so the page's rules don't stop them.
  await expect(pop).toContainText("For God so loved the world");
  // Its own styles apply: it floats by the link, not at the foot of the page.
  await expect(pop).toHaveCSS("position", "fixed");
  await expect(link).toHaveCSS("background-image", MARK);
  // Drawn, not blocked: the extension's own file is out of the page's rules' reach.
  expect(
    await link.evaluate(async (a) => {
      const img = new Image();
      img.src = getComputedStyle(a).backgroundImage.slice(5, -2);
      await img.decode().catch(() => undefined);
      return img.naturalWidth;
    }),
  ).toBe(12);
  const [l, p] = await Promise.all([link.boundingBox(), pop.boundingBox()]);
  expect(Math.abs((p?.y ?? 9999) - ((l?.y ?? 0) + (l?.height ?? 0)))).toBeLessThan(60);
});

test("vision §3.6: on a page running the website plugin, each link shows one tooltip", async ({
  page,
}) => {
  await open(
    page,
    page$(`<p id="site">The site links Jude 1:3 itself.</p>
<script src="${WIDGET}"></script><script>ScriptureTips.run("#site");</script>`),
  );
  const siteLink = page.locator("#site a.st-ref");
  await expect(siteLink).toHaveText("Jude 1:3");
  // The site's plugin got there first: the extension doesn't link it again.
  await expect(siteLink).not.toHaveAttribute("data-st-owner", "extension");
  await expect(page.locator("#site a.st-ref a")).toHaveCount(0);
  // Only the extension's own links carry its mark.
  await expect(siteLink).toHaveCSS("background-image", "none");
  await expect(page.locator("a.st-ref", { hasText: "John 3:16" })).toHaveCSS(
    "background-image",
    MARK,
  );
  for (const link of [siteLink, page.locator("a.st-ref", { hasText: "John 3:16" })]) {
    await link.hover();
    await expect(tooltip(page)).toHaveCount(1);
    await expect(tooltip(page)).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(tooltip(page)).toBeHidden();
  }
});

test("vision §3.6: a site turned off is left alone, and comes back when turned on", async ({
  page,
  worker,
}) => {
  await open(page);
  await expect(page.locator("a.st-ref")).toHaveCount(2);
  await store(worker, { settings: { version: 2, disabledSites: ["fixture.test"] } });
  await expect(page.locator("a.st-ref")).toHaveCount(0);
  await expect(page.locator("#content p").first()).toHaveText(
    "As Paul says in Romans 5:8, and John 3:16 too.",
  );
  await store(worker, { settings: { version: 2, disabledSites: [] } });
  await expect(page.locator("a.st-ref")).toHaveCount(2);
});

test("vision §3.6: v1.0.3's settings carry over: the reader's outside site, in its own translation code", async ({
  page,
  worker,
}) => {
  await store(
    worker,
    {
      defaultMode: "BBCODE",
      defaultBibleService: 2,
      tipDisabledDomains: ["elsewhere.test"],
      BibleServices: [
        {
          n: "BibleGateway.com",
          u: "https://www.biblegateway.com/passage/?search=ST_REFERENCE&version=ST_TRANSLATION",
          t: "TLV",
        },
        { n: "BibleHub.com", u: "https://biblemenus.com/search.php?q=ST_REFERENCE", t: "" },
        {
          n: "BlueLetterBible.org",
          u: "https://blueletterbible.org/search/presearch.cfm?Criteria=ST_REFERENCE&t=ST_TRANSLATION",
          t: "KJV",
        },
      ],
    },
    true,
  );
  await open(page);
  await expect(page.locator("a.st-ref").first()).toHaveAttribute(
    "href",
    "https://blueletterbible.org/search/presearch.cfm?Criteria=Romans%205%3A8&t=KJV",
  );
});

test("vision §3.6: the link generator links what the reader writes, with undo and redo", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/tool.html`);
  const text = page.getByRole("textbox", { name: "Your text" });
  await text.fill("As Paul says in Romans 5:8.\n[url=x]John 3:16[/url]");
  await page.getByRole("combobox", { name: "Format" }).selectOption({ label: "BBCode (forums)" });
  await page.getByRole("button", { name: "Add links" }).click();
  await expect(text).toHaveValue(
    "As Paul says in [url=https://dev.scripturetips.com/read?t=eng-kjv&ref=Romans%205%3A8]Romans 5:8[/url].\n[url=x]John 3:16[/url]",
  );
  await page.screenshot(shot("extension-tool"));
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(text).toHaveValue("As Paul says in Romans 5:8.\n[url=x]John 3:16[/url]");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(text).toHaveValue(/\[url=https:/);
});

test("vision §3.6: the settings choose where links go, and pages follow", async ({
  page,
  context,
  extensionId,
}) => {
  await open(page);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  // The translations come from ScriptureTips.
  await expect(
    options.getByRole("combobox", { name: "The translation the passage opens in" }),
  ).toContainText("Lexham English Bible");
  await options
    .getByRole("combobox", { name: "Where links go" })
    .selectOption({ label: "BibleGateway.com" });
  await expect(options.getByRole("status")).toHaveText("Saved.");
  // Over the clouds-and-birds artwork, with the logo, and the credits its license asks for.
  expect(
    await options.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage),
  ).toContain("brand/clouds-and-birds.svg");
  await expect(options.locator("h1 img")).toHaveJSProperty("naturalWidth", 48);
  await expect(options.getByRole("link", { name: "“Clouds And Birds”" })).toBeVisible();
  await expect(options.getByRole("link", { name: "CC BY-NC 4.0" })).toBeVisible();
  await options.screenshot(shot("extension-settings"));
  await expect(page.locator("a.st-ref").first()).toHaveAttribute(
    "href",
    "https://www.biblegateway.com/passage/?search=Romans%205%3A8&version=TLV",
  );
});

test("vision §3.6: the popup offers to turn the extension off for the tab's site", async ({
  page,
  extensionId,
}) => {
  // Opened as a page, its own tab is the active one: not a web page, so there's nothing to turn off.
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(
    page.getByText("Scripture Tips doesn't link references on this page."),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Turn off on this site" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Link generator" })).toBeVisible();
  await page.screenshot(shot("extension-popup"));
});
