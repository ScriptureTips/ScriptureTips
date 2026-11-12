import { join } from "node:path";
import { type BrowserContext, test as base, chromium, expect, type Page } from "@playwright/test";
import pkg from "../../extension/package.json" with { type: "json" };
import { capture, DEMO, demoPage, imagesOf } from "./support.ts";

/**
 * The browser extension's screenshots for the help (content/en-US/extension/{version}/images),
 * from the extension itself, loaded unpacked into Chromium from `apps/extension/dist/chrome`
 * (build it first) and reading passages from the dev stack's data server.
 */
const EXTENSION = new URL("../../extension/dist/chrome", import.meta.url).pathname;
const IMAGES = imagesOf("extension", pkg.version);
const image = (name: string) => join(IMAGES, `${name}.png`);

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures it needs from here.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 900, height: 700 },
      deviceScaleFactor: 2,
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

async function demo(page: Page) {
  await page.route(`${DEMO}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: demoPage() }),
  );
  await page.goto(DEMO);
  await expect(page.locator("a.st-ref")).toHaveCount(2);
}

const tooltip = (page: Page) => page.getByRole("dialog", { name: "Scripture passage" });

test("links: references on a page, with the extension's mark", async ({ page, extensionId }) => {
  expect(extensionId).not.toBe("");
  await demo(page);
  await capture(page, image("links"), {
    around: [page.locator("#first"), page.locator("#second")],
  });
});

test("the tooltip, its translation menu and its pin", async ({ page }) => {
  await demo(page);
  const link = page.locator("a.st-ref", { hasText: "John 3:16" });
  await link.hover();
  const pop = tooltip(page);
  await expect(pop).toContainText("For God so loved the world");
  const around = [page.locator("#first"), page.locator("#second"), pop];
  await capture(page, image("tooltip"), { around });

  const menu = pop.getByRole("combobox", { name: "Translation" });
  await menu.selectOption({ label: "LEB" });
  await expect(pop).toContainText("Lexham English Bible");
  await capture(page, image("tooltip-translation"), { around, ring: menu });

  await menu.selectOption({ label: "KJV" });
  await expect(pop).toContainText("For God so loved the world");
  const pin = pop.getByRole("button", { name: "Keep open" });
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(700, 600);
  await capture(page, image("tooltip-pin"), { around, ring: pin });
});

test("the toolbar popup", async ({ page, extensionId }) => {
  // Opened in a tab, the popup would describe its own tab: it's told the demo page's instead.
  await page.addInitScript((url) => {
    const tabs = (globalThis as unknown as { chrome: { tabs: { query: unknown } } }).chrome.tabs;
    tabs.query = async () => [{ url }];
  }, DEMO);
  await page.setViewportSize({ width: 300, height: 220 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator("#where")).toHaveText("blog.example");
  await capture(page, image("popup"), { around: [page.locator("body")], pad: 0 });
});

test("the settings page, part by part", async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const translation = page.locator("#translation");
  await expect(translation.locator("option")).not.toHaveCount(0);
  const heading = (name: string) => page.getByRole("heading", { name, exact: true });

  await capture(page, image("settings-links"), {
    around: [heading("Links"), translation, page.locator(".hint").first()],
  });
  await capture(page, image("settings-outside-sites"), {
    around: [
      heading("Outside reading sites"),
      page.locator("#restore-sites"),
      page.locator("#sites"),
    ],
  });
  const disabled = page.locator("#disabled");
  await disabled.fill("example.org\nforum.example.net");
  await capture(page, image("settings-sites-off"), {
    around: [heading("Sites turned off"), disabled],
  });
  await capture(page, image("settings-address"), {
    around: [heading("ScriptureTips address"), page.locator("#site")],
  });
});

test("the link generator", async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 820, height: 700 });
  await page.goto(`chrome-extension://${extensionId}/tool.html`);
  await page
    .locator("#text")
    .fill("Paul says in Romans 5:8 that love came first, and John 3:16 says why.");
  await page.locator("#format").selectOption({ label: "BBCode (forums)" });
  await page.getByRole("button", { name: "Add links" }).click();
  await expect(page.locator("#status")).toHaveText("Links added.");
  await capture(page, image("link-generator"), { around: [page.locator("main")] });
});
