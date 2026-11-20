import { expect, test } from "@playwright/test";

// Checks that depend on the browser engine: run in Chromium (desktop) and Firefox (Gecko).
test("the book's name opens the books, and a click outside closes them", async ({ page }) => {
  await page.goto("/read/leb/genesis/2/18-19");
  const button = page.locator(".reading-bar .book-dropdown-button");
  const panel = page.locator("#book-dropdown-panel");
  // (Pressed again until it opens: a press before the page is ready does nothing.)
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(panel.getByRole("link", { name: /^Exodus/ })).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(panel).toHaveCount(0);
});
