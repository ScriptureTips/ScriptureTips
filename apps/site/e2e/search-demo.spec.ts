import { expect, test } from "@playwright/test";

/** vision §3.14: the plugin's search, running on the help's live demo page (widget 1.1). */
test.describe("the search widget's live demos", () => {
  test("a search with no setup finds a passage and reads it in place", async ({ page }) => {
    await page.goto("/about/widget/1.1/search-demo/");
    const field = page
      .locator(".st-search:not([data-kinds]):not([data-more]) st-search-input input")
      .first();
    await expect(field).toBeVisible();
    await field.fill("John 3:16");
    await field.press("Enter");
    const result = page
      .locator(".st-search:not([data-kinds]):not([data-more]) st-search-results [part=result]")
      .first();
    await expect(result).toContainText("John 3:16");
    await result.click();
    const reader = page.locator(".st-search:not([data-kinds]):not([data-more]) st-reader");
    await expect(reader.locator("[part=passage]")).toContainText("loved the world");
    // The blue bar, with the book and chapter and the chapter steps.
    await expect(reader.locator("header [aria-haspopup]").first()).toHaveText("John");
    await expect(reader.locator("header .title button").nth(1)).toHaveText("3");
    // Only the verse that was picked, with the links to widen it.
    await expect(reader.locator("[part=verse]")).toHaveCount(1);
    await reader.getByRole("button", { name: "Read in context" }).click();
    await expect(reader.locator("[part=verse]")).toHaveCount(7);
    await reader.getByRole("button", { name: "Read the whole chapter" }).click();
    expect(await reader.locator("[part=verse]").count()).toBeGreaterThan(30);
    await expect(reader.getByRole("button", { name: "Read the whole chapter" })).toHaveCount(0);
    // Next chapter, a book from the book picker, and a translation from the translation picker.
    await reader.getByRole("button", { name: /^Next: John 4/ }).click();
    await expect(reader.locator("header .title button").nth(1)).toHaveText("4");
    await reader.locator("header .title button").first().click();
    await expect(reader.getByRole("heading", { name: "Old Testament" })).toBeVisible();
    await expect(reader.getByRole("heading", { name: "New Testament" })).toBeVisible();
    await reader.getByRole("button", { name: "Romans" }).click();
    await expect(reader.locator("header .title button").first()).toHaveText("Romans");
    const picker = reader.locator("select");
    const other = await picker.locator("option:not(:checked)").first().getAttribute("value");
    await picker.selectOption(other);
    await expect(picker).toHaveValue(other as string);
    await expect(reader.locator("[part=passage]")).toBeVisible();
    // Back to the results.
    await reader.getByRole("button", { name: "Back to the results" }).click();
    await expect(reader).toBeHidden();
    await expect(result).toBeVisible();
  });

  test("the site's --st variables theme the search and the reader", async ({ page }) => {
    await page.goto("/about/widget/1.1/search-demo/");
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--st-search-bar", "rgb(200, 30, 60)");
    });
    const field = page
      .locator(".st-search:not([data-kinds]):not([data-more]) st-search-input input")
      .first();
    await field.fill("John 3:16");
    await field.press("Enter");
    await page
      .locator(".st-search:not([data-kinds]):not([data-more]) st-search-results [part=result]")
      .first()
      .click();
    const bar = page.locator(".st-search:not([data-kinds]):not([data-more]) st-reader header");
    await expect(bar).toHaveCSS("background-color", "rgb(200, 30, 60)");
    // The bar is a fixed 3rem and its title has no margin of its own.
    await expect(bar).toHaveCSS("height", "48px");
    await expect(
      page.locator(".st-search:not([data-kinds]):not([data-more]) st-reader h3"),
    ).toHaveCSS("margin-top", "0px");
    // The host's own --ink (the site defines one) is not followed by an embedded element.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--ink", "rgb(1, 2, 3)");
    });
    await expect(
      page.locator(".st-search:not([data-kinds]):not([data-more]) st-reader article p").first(),
    ).not.toHaveCSS("color", "rgb(1, 2, 3)");
  });

  test("suggestions open as you type", async ({ page }) => {
    await page.goto("/about/widget/1.1/search-demo/");
    const field = page.locator('.st-search[data-kinds="reference"] st-search-input input');
    await field.pressSequentially("Joh");
    const options = page.locator(
      '.st-search[data-kinds="reference"] st-search-input [role=option]',
    );
    await expect(options.first()).toContainText("John");
    await field.press("ArrowDown");
    await field.press("Enter");
    await expect(
      page.locator('.st-search[data-kinds="reference"] st-search-input input'),
    ).toHaveValue(/^John/);
  });

  test("data-more=button shows a Show more button instead of scrolling on", async ({ page }) => {
    await page.goto("/about/widget/1.1/search-demo/");
    const box = page.locator('.st-search[data-more="button"]');
    await box.locator("st-search-input input").fill("hands");
    await box.locator("st-search-input input").press("Enter");
    const results = box.locator("st-search-results [part=result]");
    await expect(results.first()).toBeVisible();
    const button = box.locator("st-search-results [part=more-button]");
    await expect(button).toHaveText("Show more");
    // Styled like the Search button (the accent color), not the browser's grey one.
    await expect(button).toHaveCSS("background-color", "rgb(0, 84, 165)");
    const before = await results.count();
    await button.click();
    await expect.poll(() => results.count()).toBeGreaterThan(before);
  });

  test("a quiet credit sits in the footer of a search", async ({ page }) => {
    await page.goto("/about/widget/1.1/search-demo/");
    const brand = page.locator(".st-search:not([data-kinds]):not([data-more]) st-brand a");
    await expect(brand).toHaveText("Powered by ScriptureTips");
    await expect(brand).toHaveAttribute("href", /^https:\/\/dev\.scripture\.tips\/$/);
  });

  test("a search as you type shows results without Enter", async ({ page }) => {
    await page.goto("/about/widget/1.1/search-demo/");
    await page
      .locator(".st-search:not([data-kinds]):not([data-more]) st-search-input input")
      .first()
      .pressSequentially("so loved the world");
    await expect(
      page
        .locator(".st-search:not([data-kinds]):not([data-more]) st-search-results [part=result]")
        .first(),
    ).toContainText("John 3:16");
  });

  test("the field and the results apart, and a callback instead of reading", async ({ page }) => {
    await page.goto("/about/widget/1.1/search-demo/");
    const field = page.locator("#demo-callback-field input");
    await field.fill("so loved the world");
    await field.press("Enter");
    const result = page.locator("#demo-callback-results [part=result]").first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page.locator("#demo-picked")).toContainText("Picked John 3:16");
    await expect(page.locator("#demo-callback-results [part=passage]")).toHaveCount(0);
  });

  test("a page that only links references doesn't load the search code", async ({ page }) => {
    const loaded: string[] = [];
    page.on("request", (r) => loaded.push(r.url()));
    await page.goto("/about/widget/1.1/overview/");
    expect(loaded.filter((u) => u.includes("scripturetips-search"))).toEqual([]);
  });
});

/** vision §3.6: the passage tooltip, on the help's live demo page (widget 1.1). */
test.describe("the tooltip's live demos", () => {
  test("references are linked, open a tooltip, and the page hears of it", async ({ page }) => {
    await page.goto("/about/widget/1.1/tooltip-demo/");
    const link = page.locator("#tooltip-demo a.st-ref", { hasText: "John 3:16" }).first();
    const blocked: string[] = [];
    page.on("console", (m) => {
      if (m.text().includes("Content-Security-Policy")) blocked.push(m.text());
    });
    await link.hover();
    const tip = page.getByRole("dialog", { name: "Scripture passage" });
    await expect(tip).toContainText("For God so loved the world");
    // The site's policy allows no inline style, and the tooltip is still styled (a fixed panel).
    await expect(tip).toHaveCSS("position", "fixed");
    expect(blocked).toEqual([]);
    // The quiet credit at the foot.
    await expect(tip.getByRole("link", { name: "Powered by ScriptureTips" })).toBeVisible();
    await expect(page.locator("#demo-tip-log")).toContainText("John.3.16");
  });

  test("an abbreviation after a reference picks the translation, and your own links work", async ({
    page,
  }) => {
    await page.goto("/about/widget/1.1/tooltip-demo/");
    await page.locator("#tooltip-demo a.st-ref", { hasText: "Hebrews 11:1" }).first().hover();
    const tip = page.getByRole("dialog", { name: "Scripture passage" });
    await expect(tip).toContainText("LEB");
    await page.locator("#tooltip-demo a.st-ref", { hasText: "the shepherd psalm" }).hover();
    await expect(tip).toContainText("shepherd");
  });

  test("an ignored part and code are left alone, and added text is linked", async ({ page }) => {
    await page.goto("/about/widget/1.1/tooltip-demo/");
    await expect(page.locator("#tooltip-demo a.st-ref").first()).toBeVisible();
    await expect(page.locator("#tooltip-demo .st-ignore a")).toHaveCount(0);
    await expect(page.locator("#tooltip-demo code a")).toHaveCount(0);
    await page.getByRole("button", { name: "Add a sentence" }).click();
    await expect(page.locator("#demo-added a.st-ref")).toHaveCount(2);
  });

  test("the tooltip stays open while the translation list is used, until the pointer returns", async ({
    page,
  }) => {
    await page.goto("/about/widget/1.1/tooltip-demo/");
    await page.locator("#tooltip-demo a.st-ref", { hasText: "John 3:16" }).first().hover();
    const tip = page.getByRole("dialog", { name: "Scripture passage" });
    await expect(tip).toContainText("For God so loved the world");
    const box = await tip.boundingBox();
    if (!box) throw new Error("no tooltip");
    const inside = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // Press the translation menu (the browser's own list opens outside the page), then the pointer
    // goes where the list is: off the tooltip.
    await page.mouse.move(inside.x, inside.y);
    await tip.locator("select").dispatchEvent("pointerdown");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 120);
    await page.waitForTimeout(900);
    await expect(tip).toBeVisible();
    // Back over the tooltip, and away again: it closes as usual.
    await page.mouse.move(inside.x, inside.y);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 120);
    await expect(tip).toBeHidden();
  });
});
