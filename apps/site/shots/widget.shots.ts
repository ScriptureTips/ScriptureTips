import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import pkg from "../../widget/package.json" with { type: "json" };
import { capture, DEMO, demoPage, imagesOf } from "./support.ts";

/**
 * The website plugin's screenshots for the help (content/en-US/widget/{version}/images): the
 * built script (`apps/widget/dist`, build it first) on a page of another website, reading
 * passages from the dev stack's data server.
 */
const DATA = "https://dev.scripture.tips";
const SCRIPT = new URL("../../widget/dist/scripturetips.js", import.meta.url).pathname;
const IMAGES = imagesOf("widget", pkg.version);
const image = (name: string) => join(IMAGES, `${name}.png`);

test.use({
  viewport: { width: 900, height: 700 },
  deviceScaleFactor: 2,
  // A page answered here counts as public, and the dev stack as a private network.
  launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks"] },
});

async function demo(page: Page, head = "") {
  // The script as the data server will serve it, straight from the build.
  await page.route(`${DATA}/widget/scripturetips.js`, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(SCRIPT) }),
  );
  await page.route(`${DEMO}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: demoPage(head).replace(
        "</body>",
        `<script src="${DATA}/widget/scripturetips.js"></script><script>ScriptureTips.run("main");</script></body>`,
      ),
    }),
  );
  await page.goto(DEMO);
  await page.locator("a.st-ref", { hasText: "John 3:16" }).hover();
  const pop = page.getByRole("dialog", { name: "Scripture passage" });
  await expect(pop).toContainText("For God so loved the world");
  return [page.locator("#first"), page.locator("#second"), pop];
}

test("the tooltip on a website", async ({ page }) => {
  await capture(page, image("tooltip"), { around: await demo(page) });
});

test("the tooltip with a site's own colors", async ({ page }) => {
  const around = await demo(
    page,
    `<style>:root { --st-paper: #1f2430; --st-ink: #f2efe6; --st-muted: #b8bcc8; --st-rule: #3a4152;
      --st-accent: #ffcf70; --st-radius: 0; --st-font: Georgia, serif; }</style>`,
  );
  await capture(page, image("theme"), { around });
});
