import { expect, type Page, test } from "@playwright/test";

/**
 * The scripture.tips site (vision §7.2) as the dev stack serves it: its pages, the help with its
 * search and versioned addresses, and the cache policy of apps/site/site.caddy.
 */
const shot = (name: string) => ({
  path: `test-results/screens/${test.info().project.name}-${name}.png`,
  fullPage: true,
});

// The plugin's test answers another site's page itself; Chromium counts such a page as public
// and the dev stack as a private network, and that check is off here (as in apps/web/e2e).
test.use({ launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks"] } });

/** Fails the test if the page logs an error (a blocked script or style, say). */
function noErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("vision §7.2: the home page leads to the extension, the plugin, the help and the reader", async ({
  page,
}) => {
  const errors = noErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Scripture on every page you read",
  );
  await expect(page.getByRole("link", { name: "Get the extension" })).toHaveAttribute(
    "href",
    "/downloads/#extension",
  );
  // The page shows the public name; the link goes to the reader this build is for.
  await expect(page.getByRole("link", { name: "scripturetips.com", exact: true })).toHaveAttribute(
    "href",
    "https://dev.scripturetips.com",
  );
  // No way to sign in, and nothing kept in the browser.
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  expect(await page.context().cookies()).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.screenshot(shot("home"));
  for (const name of ["Help", "Downloads", "Credits", "Privacy", "Terms", "Contact"]) {
    await page.getByRole("contentinfo").getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(new URL(page.url()).pathname).not.toBe("/");
    await page.goBack();
  }
  expect(errors).toEqual([]);
});

test("the downloads page gives the plugin's script from this site", async ({ page }) => {
  await page.goto("/downloads/");
  await expect(page.locator("pre").first()).toContainText(
    '<script src="https://scripture.tips/widget/scripturetips.js"></script>',
  );
  await page.screenshot(shot("downloads"));
});

test("the help: a table of contents for each product, and a search that stays in the browser", async ({
  page,
}) => {
  const errors = noErrors(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/about/");
  await expect(page.getByRole("heading", { name: /Browser extension/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Website plugin/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "The link generator" })).toBeVisible();

  const box = page.getByRole("searchbox", { name: "Search the help" });
  await box.fill("keep open");
  const results = page.locator(".search-results li");
  await expect(results.first()).toContainText("Keeping a passage open");
  await expect(page.getByRole("status")).toHaveText(/Topics found: \d+/);
  await page.screenshot(shot("help-search"));
  // What was typed went nowhere: every request is a file of this site, with no query.
  for (const url of requests) {
    expect(new URL(url).origin).toBe("https://dev.scripture.tips");
    expect(new URL(url).search).toBe("");
  }
  await box.fill("zzzz");
  await expect(page.getByRole("status")).toHaveText("Nothing in the help matches that.");

  await box.fill("keep open");
  await results.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/about\/extension\/pin\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Keeping a passage open");
  expect(errors).toEqual([]);
});

test("the help's front page takes a search in its address", async ({ page }) => {
  await page.goto("/about/?q=bbcode");
  await expect(page.locator(".search-results li").first()).toContainText("The link generator");
});

test("a help topic: its screenshot, its place in the contents, and the way on", async ({
  page,
}) => {
  const errors = noErrors(page);
  await page.goto("/about/extension/pin/");
  const image = page.getByRole("img", { name: /pin button/ });
  await image.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  expect(await image.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(
    true,
  );
  await expect(
    page.getByRole("navigation", { name: "Help topics" }).locator('[aria-current="page"]'),
  ).toHaveText("Keeping a passage open");
  // Nothing wider than the screen, on a phone too.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot(shot("help-topic"));
  await page.getByRole("link", { name: /^Next/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Making the text larger or smaller",
  );
  expect(errors).toEqual([]);
});

test("the help's addresses: a version's own, a full version number, and a version not written yet", async ({
  page,
  request,
}) => {
  await page.goto("/about/extension/2.0/pin/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Keeping a passage open");
  await expect(page.getByRole("navigation", { name: "Help for version" })).toContainText("2.0");

  // The extension's help links carry its full version: 2.0.7 reads 2.0's help, for good.
  const patch = await request.get("/about/extension/2.0.7/pin/#unpinning", { maxRedirects: 0 });
  expect(patch.status()).toBe(308);
  expect(patch.headers()["location"]).toBe("/about/extension/2.0/pin/");
  // A version newer than the help reads the current help, until its own is published.
  const ahead = await request.get("/about/extension/9.4/pin/", { maxRedirects: 0 });
  expect(ahead.status()).toBe(302);
  expect(ahead.headers()["location"]).toBe("/about/extension/pin/");

  const missing = await request.get("/about/extension/no-such-topic/");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("Page not found");
});

test("caching: pages for minutes with an ETag, hashed files for good, and never a cookie", async ({
  request,
}) => {
  const home = await request.get("/about/extension/pin/");
  expect(home.headers()["cache-control"]).toBe("public, max-age=300, stale-while-revalidate=86400");
  const etag = home.headers()["etag"] ?? "";
  expect(etag).not.toBe("");
  const again = await request.get("/about/extension/pin/", { headers: { "If-None-Match": etag } });
  expect(again.status()).toBe(304);

  const html = await home.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1] as string);
  expect(assets.some((a) => a.endsWith(".css"))).toBe(true);
  expect(assets.some((a) => a.endsWith(".png"))).toBe(true);
  expect(assets.some((a) => a.endsWith(".js"))).toBe(true);
  for (const asset of assets) {
    const res = await request.get(asset);
    expect(res.status(), asset).toBe(200);
    expect(res.headers()["cache-control"], asset).toBe("public, max-age=31536000, immutable");
    expect(res.headers()["set-cookie"], asset).toBeUndefined();
  }

  const script = await request.get("/widget/scripturetips.js");
  expect(script.headers()["cache-control"]).toBe(
    "public, max-age=3600, stale-while-revalidate=86400",
  );
  expect(script.headers()["access-control-allow-origin"]).toBe("*");

  for (const path of ["/", "/about/", "/nowhere/", "/widget/scripturetips.js", "/robots.txt"]) {
    const res = await request.get(path);
    expect(res.headers()["set-cookie"], path).toBeUndefined();
    expect(res.headers()["x-content-type-options"], path).toBe("nosniff");
  }
});

test("text travels compressed", async ({ playwright }) => {
  const context = await playwright.request.newContext({
    baseURL: "https://dev.scripture.tips",
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { "Accept-Encoding": "br" },
  });
  const res = await context.get("/about/");
  expect(res.headers()["content-encoding"]).toBe("br");
  expect(res.headers()["vary"] ?? "").toMatch(/accept-encoding/i);
  await context.dispose();
});

test.describe("the website plugin, served from the data server", () => {
  test("vision §7.2: another site's page loads the script here, reads passages here, and its links open the reader", async ({
    page,
  }) => {
    await page.route("https://fixture.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title></head>
<body><main><p>See John 3:16 today.</p></main>
<script src="https://dev.scripture.tips/widget/scripturetips.js"></script>
<script>ScriptureTips.run("main");</script></body></html>`,
      }),
    );
    await page.goto("https://fixture.test/");
    const link = page.locator("a.st-ref");
    await expect(link).toHaveAttribute("href", /^https:\/\/dev\.scripturetips\.com\/read\?/);
    const passage = page.waitForResponse((r) => r.url().includes("/api/widget/passage"));
    if (test.info().project.name === "phone") await link.tap();
    else await link.hover();
    expect(new URL((await passage).url()).origin).toBe("https://dev.scripture.tips");
    await expect(page.getByRole("dialog", { name: "Scripture passage" })).toContainText(
      "For God so loved the world",
    );
  });
});
