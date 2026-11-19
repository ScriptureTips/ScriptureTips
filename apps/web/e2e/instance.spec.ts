import { expect, test } from "@playwright/test";
import { shot } from "./support.ts";

/**
 * The about, contact, privacy and terms pages (vision §10, extension release), and the reader
 * with accounts closed. The stack runs with accounts open by default; the closed tests run when
 * it was started with `ACCOUNTS=closed ./dev up --lan`, and are skipped otherwise.
 */

test("the footer links the about, contact, privacy, terms and credits pages", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator(".site-footer");
  for (const [name, title] of [
    ["About", "About ScriptureTips"],
    ["Contact", "Contact"],
    ["Privacy", "Privacy policy"],
    ["Terms", "Terms of use"],
    ["Credits", "Credits"],
  ]) {
    await footer.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await page.screenshot(shot(`info-${name.toLowerCase()}`));
    await page.goto("/");
  }
});

test("the contact page gives the instance's own address", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("link", { name: "help@scripturetips.localhost" })).toHaveAttribute(
    "href",
    "mailto:help@scripturetips.localhost",
  );
});

test.describe("accounts closed", () => {
  // Asked through the browser, through Caddy as a real visitor would.
  test.beforeEach(async ({ page }) => {
    const signIn = await page.goto("/sign-in");
    test.skip(signIn?.status() !== 404, "the stack has accounts open");
  });

  test("the reader works with no sign-in anywhere and no cookies", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("combobox", { name: "Passage or words" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await page.screenshot(shot("closed-landing"));

    await page.goto("/read/leb/genesis/2/18-25");
    await expect(page.getByRole("heading", { level: 1, name: "Genesis 2:18–25" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await page.screenshot(shot("closed-reader"));
    expect(await context.cookies()).toEqual([]);
  });

  test("the pages that need accounts aren't there", async ({ page }) => {
    for (const path of [
      "/sign-in",
      "/account",
      "/compilations",
      "/compilations/anything",
      "/p/someone/something",
      "/read/@someone/something/genesis/1",
    ]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
    await page.screenshot(shot("closed-not-found"));
  });
});
