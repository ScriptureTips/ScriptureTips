import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, test as base, chromium, expect, type Page } from "@playwright/test";
import { DEMO, showPublicHosts } from "./support.ts";

/**
 * The browser extension's screenshots for the stores' listings (Firefox add-ons and the Chrome Web
 * Store): 1280 × 800, the size both ask for, from the extension itself, loaded unpacked into
 * Chromium from `apps/extension/dist/chrome` (build it first), written to
 * `apps/extension/store/screenshots`. Not the help's screenshots (`extension.shots.ts`): those are
 * cropped to a topic, these show whole pages.
 */
const EXTENSION = new URL("../../extension/dist/chrome", import.meta.url).pathname;
const OUT = new URL("../../extension/store/screenshots", import.meta.url).pathname;
const file = (name: string) => join(OUT, `${name}.png`);

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures it needs from here.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
        "--ignore-certificate-errors",
        "--disable-features=LocalNetworkAccessChecks",
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const [worker] = context.serviceWorkers();
    await use(new URL((worker ?? (await context.waitForEvent("serviceworker"))).url()).host);
  },
  page: async ({ context }, use) => {
    await use(await context.newPage());
  },
});

/** Someone else's blog, written like other people's sites, with no ScriptureTips of its own. */
const BLOG = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Notes from Sunday</title>
<style>
  body { margin: 0; background: #f4f1ea; color: #2b2b2b; font: 21px/1.65 Georgia, serif; }
  header { padding: 22px 0; text-align: center; font: 600 15px/1 system-ui, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6458; border-bottom: 1px solid #ddd6c8; }
  main { max-width: 780px; margin: 0 auto; padding: 36px 24px; }
  h1 { margin: 0 0 6px; font-size: 40px; line-height: 1.15; }
  .by { margin: 0 0 28px; font: 15px system-ui, sans-serif; color: #7a7366; }
  p { margin: 0 0 20px; }
</style></head><body>
<header>The Wayside Blog</header>
<main>
  <h1>Notes from Sunday</h1>
  <p class="by">Posted by Sam, 14 November</p>
  <p id="first">The sermon began with Romans 5:8, where Paul says that love came first. We were not asked to clean ourselves up and then come: Christ died for us while we were still sinners.</p>
  <p id="second">It ended, as you might expect, with John 3:16, and then a short prayer from Psalm 23.</p>
  <p>Afterwards we talked about Matthew 5:3–12, and how strange the Beatitudes sound the first time you really listen to them.</p>
</main></body></html>`;

async function blog(page: Page) {
  await page.route(`${DEMO}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: BLOG }),
  );
  await page.goto(DEMO);
  await expect(page.locator("a.st-ref")).not.toHaveCount(0);
}

async function snap(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await showPublicHosts(page);
  await page.mouse.move(1270, 790);
  await page.screenshot({ path: file(name), animations: "disabled", caret: "hide" });
}

const tooltip = (page: Page) => page.getByRole("dialog", { name: "Scripture passage" });

test("1: a passage in a tooltip, on any page", async ({ page }) => {
  await blog(page);
  await page.locator("a.st-ref", { hasText: "John 3:16" }).hover();
  await expect(tooltip(page)).toContainText("For God so loved the world");
  await snap(page, "1-passage-tooltip");
});

test("2: choose a translation, and pin passages to keep them open", async ({ page }) => {
  await blog(page);
  await page.locator("a.st-ref", { hasText: "Romans 5:8" }).hover();
  await expect(tooltip(page)).toContainText("commendeth");
  await tooltip(page).getByRole("button", { name: "Keep open" }).click();
  await page.mouse.move(1270, 790);
  await page.locator("a.st-ref", { hasText: "John 3:16" }).hover();
  await expect(tooltip(page)).toHaveCount(2);
  await tooltip(page)
    .last()
    .getByRole("combobox", { name: "Translation" })
    .selectOption({ label: "LEB" });
  await expect(tooltip(page).last()).toContainText("Lexham English Bible");
  await tooltip(page).last().getByRole("button", { name: "Keep open" }).click();
  await snap(page, "2-translations-and-pins");
});

test("3: the link generator, for the pages you write", async ({ page, context, extensionId }) => {
  await blog(page);
  const helper = await context.newPage();
  await helper.goto(`chrome-extension://${extensionId}/options.html`);
  await page.bringToFront();
  await helper.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        chrome: {
          tabs: {
            query(q: object): Promise<{ id: number }[]>;
            sendMessage(t: number, m: object): Promise<unknown>;
          };
        };
      }
    ).chrome;
    const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
    await api.tabs.sendMessage(tab?.id as number, { type: "open-generator" });
  });
  const win = page.getByRole("dialog", { name: "Link generator" });
  await win
    .getByRole("textbox", { name: "Your text" })
    .fill("Paul says in Romans 5:8 that love came first, and John 3:16 says why.");
  await win.getByRole("combobox", { name: "Format" }).selectOption({ label: "BBCode (forums)" });
  await win.getByRole("button", { name: "Add links" }).click();
  await expect(win.getByRole("status")).toHaveText("Links added.");
  // The window is in a shadow root, which the public names' swap doesn't reach.
  await win.getByRole("textbox", { name: "Your text" }).evaluate((field: HTMLTextAreaElement) => {
    field.value = field.value.split("dev.scripturetips.com").join("scripturetips.com");
  });
  await snap(page, "3-link-generator");
});

test("4: the settings, with outside reading sites", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator("#translation option")).not.toHaveCount(0);
  await snap(page, "4-settings");
});

/**
 * The listing's promotional images (the Chrome Web Store's small tile, 440 × 280, and marquee,
 * 1400 × 560): the logo, the name and a plain line on a pale sky blue, never the clouds artwork
 * (its CC BY-NC license wants a credit, which an image this small has no room for), and for the
 * marquee a crop of the first screenshot's real tooltip, at 1.3 times its size. JPEG, since the store wants no alpha.
 */
const STORE = new URL("../../extension/store/", import.meta.url).pathname;
const dataUri = (path: string, type: string) =>
  `data:${type};base64,${readFileSync(path).toString("base64")}`;

const PROMO_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "Helvetica Neue", Arial, system-ui, sans-serif; color: #0b2e4f;
    background: linear-gradient(135deg, #f2fafe 0%, #c6e9fa 100%); overflow: hidden; }
  .name { font-weight: 700; letter-spacing: -0.01em; color: #0054a5; }
  .line { color: #1f4f78; }
`;

test("promo images: the small tile and the marquee", async ({ page }) => {
  const logo = dataUri(join(STORE, "logo-180.png"), "image/png");
  const shot = dataUri(file("1-passage-tooltip"), "image/png");

  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<style>${PROMO_CSS}
    body { width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; padding: 0 28px; }
    img { width: 120px; height: 120px; mix-blend-mode: multiply; }
    .name { font-size: 40px; line-height: 1.05; }
    .line { font-size: 19px; line-height: 1.3; }
  </style>
  <img src="${logo}" alt=""><div class="name">Scripture Tips</div><div class="line">The passage, one hover away</div>`);
  await page.screenshot({
    path: join(STORE, "promo-small-440x280.jpg"),
    type: "jpeg",
    quality: 100,
  });

  await page.setViewportSize({ width: 1400, height: 560 });
  await page.setContent(`<style>${PROMO_CSS}
    body { width: 1400px; height: 560px; position: relative; }
    .brand { position: absolute; left: 110px; top: 0; bottom: 0; width: 640px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
    .brand img { width: 150px; height: 150px; mix-blend-mode: multiply; }
    .name { font-size: 84px; line-height: 1; }
    .line { font-size: 34px; line-height: 1.3; max-width: 560px; }
    .card { position: absolute; right: 120px; top: 50%; width: 358px; height: 158px; margin-top: -79px;
      background: url(${shot}) -551px -321px no-repeat; border-radius: 10px; box-shadow: 0 10px 30px rgb(0 30 60 / 0.25); transform: scale(1.3); transform-origin: center; }
  </style>
  <div class="brand"><img src="${logo}" alt=""><div class="name">Scripture Tips</div>
  <div class="line">Hover or tap any scripture reference to read the passage in place.</div></div>
  <div class="card"></div>`);
  await page.screenshot({
    path: join(STORE, "promo-marquee-1400x560.jpg"),
    type: "jpeg",
    quality: 100,
  });
});
