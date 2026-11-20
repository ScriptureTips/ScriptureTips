import { expect, test } from "@playwright/test";
import { shot, signUp } from "./support.ts";

test("the landing page has a search box and no translation filter", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Passage or words" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Translation" })).toHaveCount(0);
  await page.screenshot(shot("landing"));
});

test("the home search finds a passage, and picking it opens the reader", async ({ page }) => {
  await page.goto("/");
  const field = page.getByRole("combobox", { name: "Passage or words" });
  await field.fill("gen 2 18-25");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  // The widget's own pick (the passage shown in the field first) is replaced by the redirect,
  // so the page never asks for the passage's text to show it there.
  const shownInWidget: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/passages?")) shownInWidget.push(r.url());
  });
  await page.getByRole("listitem").filter({ hasText: "Genesis 2:18" }).first().click();
  await expect(page).toHaveURL(/\/read\/leb\/genesis\/2\/18-25$/);
  await expect(page.getByRole("heading", { level: 1, name: "Genesis 2:18–25" })).toBeVisible();
  expect(shownInWidget).toEqual([]);
});

test("the home search reads Jude 1 as the whole book, and Jude 1:1 as its first verse", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.getByRole("combobox", { name: "Passage or words" });
  const first = page.getByRole("listitem").filter({ hasText: "Jude" }).first();

  await field.fill("Jude 1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(first.locator("[part=label]")).toHaveText("Jude");
  await first.click();
  await expect(page).toHaveURL(/\/read\/leb\/jude\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Jude" })).toBeVisible();

  await page.goto("/");
  await field.fill("Jude 1:1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(first.locator("[part=label]")).toHaveText("Jude 1:1");
});

test("the home page has its search field in the page itself, and it reads a passage without scripts", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: "Passage or words" }).fill("Genesis 1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/read\/[^/]+\/genesis\/1$/);
  await context.close();
});

test("signed in, the home page has no header links; the book opens the account page", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signUp(page);
  await page.goto("/");
  const header = page.locator(".site-header");
  await expect(header.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await page.getByRole("link", { name: "Your account" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("the home search opens with an empty field, and John 3:16 already searched", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.getByRole("combobox", { name: "Passage or words" });
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("placeholder", "Passage or words");
  // The words aren't a label above the field any more.
  await expect(page.locator(".home-search .search-label")).toHaveCount(0);
  await expect(page.locator("st-search-results")).toContainText("John 3:16");
  // The verse shows whole, not cut after a few lines (the search is asked for a longer preview).
  await expect(page.locator("st-search-results")).toContainText("will have eternal life");
});

test("the home search covers every translation: words find a verse in the one that holds them", async ({
  page,
}) => {
  await page.goto("/");
  // The search component has taken over from the stand-in field.
  const field = page.getByRole("combobox", { name: "Passage or words" });
  await expect(field).toBeVisible();
  // "before" is a small word the index leaves out; it still has to be in the verse. The LEB has
  // Isaiah 53:2 as "like a shoot before him": picking it opens it in the LEB, where it matched.
  await field.fill("shoot before");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.locator("st-search-results");
  const hit = results.getByRole("listitem").filter({ hasText: "Isaiah 53:2" }).first();
  await expect(hit).toContainText("LEB");
  await expect(hit.locator("mark")).toHaveText(["shoot", "before"]);
  await hit.click();
  await expect(page).toHaveURL(/\/read\/leb\/isaiah\/53\/2$/);
});

test("the home search goes on as the list is scrolled: the next verses load at its end", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.getByRole("combobox", { name: "Passage or words" });
  await expect(field).toBeVisible();
  // "shoot" is in far more verses than the ten a page holds.
  await field.fill("shoot");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const items = page.locator("st-search-results").getByRole("listitem");
  await expect(items.first()).toBeVisible();
  await expect(items.filter({ hasText: "Isaiah 53:2" })).toHaveCount(0);
  const first = await items.count();
  // Scrolling to the end of the list loads the next page, and the end moves on.
  await expect(async () => {
    await items.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 2000);
    expect(await items.count()).toBeGreaterThan(first);
  }).toPass({ timeout: 15_000 });
  const second = await items.count();
  await expect(async () => {
    await items.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 2000);
    expect(await items.count()).toBeGreaterThan(second);
  }).toPass({ timeout: 15_000 });
  await page.screenshot(shot("home-search-more"));
});

test("the passage's title is edited in place, and the translation is chosen at the top", async ({
  page,
}) => {
  await page.goto("/read/leb/genesis/2/18-25");
  // No form fields above the chapter bar any more.
  await expect(page.getByRole("textbox", { name: "Passage" })).toHaveCount(0);
  await page.getByRole("button", { name: "Genesis 2:18–25" }).click();
  const field = page.getByRole("textbox", { name: "Passage" });
  await expect(field).toBeFocused();
  // The form has the whole bar, whatever the width: the field is wide enough to read.
  expect((await field.boundingBox())?.width ?? 0).toBeGreaterThan(150);
  await page.screenshot(shot("passage-title-editing"));
  // Escape puts the title back.
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  // Leaving the field puts the title back, as plain text in the bar: no pencil, nothing that looks
  // like a button.
  await expect(page.locator(".passage-title-icon")).toHaveCount(0);
  await page.getByRole("button", { name: "Genesis 2:18–25" }).click();
  await page.mouse.click(2, 2);
  await expect(field).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Genesis 2:18–25" })).toBeVisible();
  await page.getByRole("button", { name: "Genesis 2:18–25" }).click();
  await field.fill("Psalm 23");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page).toHaveURL(/\/read\/leb\/psalms\/23$/);
  // Another translation, from the menu: the same passage in it, under the first.
  const toggle = page.locator(".reader-menu-toggle");
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass();
  await page.locator("#reader-menu-translation").getByRole("button", { name: /^KJV:/ }).click();
  await expect(page).toHaveURL(/\/read\/leb\/psalms\/23\?with=eng-kjv$/);
  await page.screenshot(shot("passage-title"));
});

test("the book's name in the chapter bar opens the books by section as a dropdown", async ({
  page,
}) => {
  await page.goto("/read/leb/genesis/2/18-25");
  // No tabs on the page: the books are in the dropdown, under the bar.
  await expect(page.getByRole("tablist", { name: "Books by section" })).toHaveCount(0);
  const button = page.locator(".reading-bar .book-dropdown-button");
  await expect(button).toHaveText("Genesis");
  // The passage is edited in the blue bar, and the Translation dropdown is under it, to the right.
  const bar = await page.locator(".reading-bar").boundingBox();
  const translation = await page.locator(".reader-menu-toggle").boundingBox();
  expect(
    await page.locator(".reading-bar").getByRole("button", { name: "Genesis 2:18–25" }).count(),
  ).toBe(1);
  expect(translation?.y ?? 0).toBeGreaterThan((bar?.y ?? 0) + (bar?.height ?? 0));
  expect((translation?.x ?? 0) + (translation?.width ?? 0)).toBeGreaterThan(
    (bar?.x ?? 0) + (bar?.width ?? 0) - 40,
  );
  // It opens on the section of the book being read.
  const panel = page.locator("#book-dropdown-panel");
  // (Pressed again until it opens: a press before the page is ready does nothing.)
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(panel.getByRole("tab", { name: "Old Testament" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(panel.getByRole("link", { name: "Exodus" })).toBeVisible();
  await expect(panel.getByRole("link", { name: /^Genesis/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.screenshot(shot("reader-menu-books"));
  // The other sections are its tabs.
  await panel.getByRole("tab", { name: "New Testament" }).click();
  await expect(panel.getByRole("link", { name: /^Romans/ })).toBeVisible();
  // Escape and a press outside close it.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await button.click();
  // (The corner of the window: the dropdown covers the passage's title.)
  await page.mouse.click(2, 2);
  await expect(panel).toHaveCount(0);
  // A book opens at its first chapter, and the dropdown closes.
  await button.click();
  await panel.getByRole("link", { name: /^Exodus/ }).click();
  await expect(page).toHaveURL(/\/read\/leb\/exodus\/1$/);
  await expect(panel).toHaveCount(0);
});

test("the Translation menu shows several translations stacked, and never fewer than one", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/read/leb/genesis/1/1-3");
  const toggle = page.locator(".reader-menu-toggle");
  const versions = page.locator(".reader-version");
  // One translation: no heading over it.
  await expect(versions).toHaveCount(1);
  await expect(page.locator(".reader-version-heading")).toHaveCount(0);
  // (Pressed again until it opens: a press before the page is ready does nothing.)
  const openMenu = () =>
    expect(async () => {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
    }).toPass();
  await openMenu();
  const choice = (abbreviation: string) =>
    page.locator("#reader-menu-translation").getByRole("button", {
      name: new RegExp(`^${abbreviation}:`),
    });
  await expect(choice("LEB")).toHaveAttribute("aria-pressed", "true");
  await expect(choice("BSB")).toHaveAttribute("aria-pressed", "false");
  // A name wider than its column is clipped to one line; hovered, it opens out in full.
  const long = page.locator(".reader-choice-label", { hasText: /^DRA:/ });
  if (await page.evaluate(() => matchMedia("(hover: hover) and (min-width: 40.01rem)").matches)) {
    const height = (await long.boundingBox())?.height ?? 0;
    await long.hover();
    await expect(long).toHaveCSS("overflow", "visible");
    expect((await long.boundingBox())?.height).toBe(height);
    // A name in the right column spills past the menu's edge: no scrollbar, and nothing clipped.
    const right = page.locator(".reader-choice-label", { hasText: /^OEBCW:/ });
    await right.hover();
    const panel = page.locator("#reader-menu-translation");
    // (Nothing in the menu scrolls or clips, so there's no scrollbar to show.)
    await expect(panel).toHaveCSS("overflow", "visible");
    const spill = await right.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().right;
    });
    expect(spill).toBeGreaterThan((await panel.boundingBox())?.x ?? 0);
    await page.screenshot(shot("reader-menu-long-name"));
  }

  // Another one on: both are shown, the first above, each under its name; the menu stays open.
  await choice("BSB").click();
  await expect(page).toHaveURL(/\/read\/leb\/genesis\/1\/1-3\?with=bsb$/);
  await expect(versions).toHaveCount(2);
  await expect(page.locator(".reader-version-heading")).toHaveText([/^LEB/, /^BSB/]);
  await expect(versions.nth(0)).toContainText("In the beginning");
  await expect(versions.nth(1)).toContainText("In the beginning");
  await expect(choice("BSB")).toHaveAttribute("aria-pressed", "true");
  await page.screenshot(shot("reader-menu-translations"));

  // The chapter's arrows keep both.
  await page.keyboard.press("Escape");
  await page.goto("/read/leb/genesis/1?with=bsb");
  // The arrows say, on hover, which chapter they go to.
  await expect(page.getByRole("link", { name: "Next: Genesis 2" }).first()).toHaveAttribute(
    "title",
    "Genesis 2",
  );
  await page.getByRole("link", { name: "Next: Genesis 2" }).first().click();
  await expect(page).toHaveURL(/\/read\/leb\/genesis\/2\?with=bsb$/);
  await expect(versions).toHaveCount(2);

  // A guest is held to six translations at once: the address can't name more, and the menu
  // won't turn on a seventh.
  await page.goto("/read/leb/genesis/1/1?with=bsb,eng-kjv,eng-asv,engwebp,engnet,engmsb");
  await expect(versions).toHaveCount(6);
  await openMenu();
  const off = page.locator("#reader-menu-translation .reader-choice[aria-pressed='false']").first();
  await expect(off).toHaveAttribute("aria-disabled", "true");
  await off.click({ force: true });
  await expect(versions).toHaveCount(6);
  await page.keyboard.press("Escape");
  await page.goto("/read/leb/genesis/2?with=bsb");
  await openMenu();
  // A guest has no compilations or favourites, so there are no groups to pick: no footer.
  await openMenu();
  await expect(page.locator(".reader-menu-footer")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto("/read/leb/genesis/2?with=bsb");

  // The first one off: the other takes its place in the address.
  await openMenu();
  await choice("LEB").click();
  await expect(page).toHaveURL(/\/read\/bsb\/genesis\/2$/);
  await expect(versions).toHaveCount(1);
  // The last one can't be turned off.
  await openMenu();
  await expect(choice("BSB")).toHaveAttribute("aria-disabled", "true");
  // (Forced: Playwright treats an aria-disabled button as not clickable.)
  await choice("BSB").click({ force: true });
  await expect(page).toHaveURL(/\/read\/bsb\/genesis\/2$/);
  await expect(versions).toHaveCount(1);
});

test("a part of a chapter has links under it to read in context, until it's the whole chapter", async ({
  page,
}) => {
  await page.goto("/read/leb/genesis/2/18-19");
  const context = page.getByRole("link", { name: "Read in context" });
  await context.click();
  await expect(page).toHaveURL(/\/read\/leb\/genesis\/2\/15-22$/);
  await expect(page.locator(".verse", { hasText: "15" })).toBeVisible();
  // Each step adds three verses each side, until the chapter's start and end are reached.
  await context.click();
  await expect(page).toHaveURL(/\/read\/leb\/genesis\/2\/12-25$/);
  await context.click();
  await expect(page).toHaveURL(/\/read\/leb\/genesis\/2\/9-25$/);
  // The whole chapter in one press, from any part of it: the link is under the passage, above
  // the notes.
  await page.goto("/read/leb/genesis/2/18-19");
  const whole = page.getByRole("link", { name: "Read the whole chapter" });
  const notes = await page.locator(".notes").first().boundingBox();
  if (notes) expect((await whole.boundingBox())?.y ?? 0).toBeLessThan(notes.y);
  await whole.click();
  await expect(page).toHaveURL(/\/read\/leb\/genesis\/2$/);
  await expect(context).toHaveCount(0);
  await expect(whole).toHaveCount(0);
  await page.goto("/read/leb/genesis/1");
  await expect(context).toHaveCount(0);
});

test("LEB Genesis 2: idiom brackets, verse numbers and the translator's notes", async ({
  page,
}) => {
  await page.goto("/read/leb/genesis/2/18-25");
  const idiom = page.locator(".idiom").first();
  await expect(idiom).toContainText("⸤");
  await expect(page.locator(".verse", { hasText: "23" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Translator's notes" }).locator("li").first(),
  ).toBeVisible();
  // licenses.md §3.1: "(LEB)" after the quotation and the credit statement, linked.
  await expect(page.locator(".scripture .designation")).toHaveText(" (LEB)");
  await expect(page.locator(".designation a")).toHaveAttribute(
    "href",
    "http://www.lexhamenglishbible.com",
  );
  await expect(page.locator(".attribution")).toContainText(
    "Scripture quotations marked (LEB) are from the Lexham English Bible.",
  );
  await expect(page.getByRole("link", { name: "Logos Bible Software" }).first()).toHaveAttribute(
    "href",
    "http://www.logos.com",
  );
  await page.screenshot(shot("leb-genesis-2"));
});

test("a note mark links to its note", async ({ page }) => {
  await page.goto("/read/leb/genesis/2/18-25");
  const mark = page.locator(".note-mark a").first();
  const target = await mark.getAttribute("href");
  await mark.click();
  await expect(page.locator(`${target}`)).toBeInViewport();
});

test("a note mark shows its note as a tooltip, and the list keeps it", async ({ page }) => {
  await page.goto("/read/leb/genesis/2/18-25");
  const mark = page.locator(".note-mark").first();
  const tip = mark.locator(".note-tip");
  await expect(tip).toBeHidden();
  const text = ((await tip.textContent()) ?? "").trim();
  expect(text.length).toBeGreaterThan(0);
  // (Hovered again until it opens: the tooltip is bound once the page is ready.)
  await expect(async () => {
    await page.mouse.move(2, 2);
    await mark.locator("a").hover();
    await expect(tip).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(tip).toHaveAttribute("role", "tooltip");
  await page.screenshot(shot("note-tooltip"));
  // The pointer can cross the gap between the mark and the tip, and rest on the tip past the
  // close delay, without it closing (so its text can be selected).
  if (test.info().project.name !== "phone") {
    const box = await tip.boundingBox();
    if (!box) throw new Error("the tip has no box");
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height + 3);
    await page.waitForTimeout(100);
    await page.mouse.move(x, box.y + box.height / 2);
    await page.waitForTimeout(600);
    await expect(tip).toBeVisible();
    // Pressing on its text (to select it) takes the focus off the mark, and doesn't close it.
    await page.mouse.down();
    await page.waitForTimeout(600);
    await expect(tip).toBeVisible();
    await page.mouse.up();
  }
  await page.mouse.move(2, 2);
  await expect(tip).toBeHidden();
  // The list at the bottom of the passage still holds every note.
  await expect(
    page.getByRole("region", { name: "Translator's notes" }).locator("li").first(),
  ).toContainText(text.slice(0, 20));
});

test("on a touch screen, the first tap on a note mark shows the note and a second follows it", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "touch only");
  await page.goto("/read/leb/genesis/2/18-25");
  // (A tap before the page is ready follows the link.)
  await page.waitForLoadState("networkidle");
  const mark = page.locator(".note-mark").first();
  const tip = mark.locator(".note-tip");
  await expect(async () => {
    await mark.locator("a").tap();
    await expect(tip).toBeVisible({ timeout: 1000 });
  }).toPass();
  expect(new URL(page.url()).hash).toBe("");
  // Pressing on the note's text, to select it, keeps it open.
  await tip.tap();
  await page.waitForTimeout(600);
  await expect(tip).toBeVisible();
  await mark.locator("a").tap();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#p0-n\d+$/);
  // A tap elsewhere closes it.
  await page.locator(".note-mark").nth(1).locator("a").tap();
  await page.getByRole("heading", { name: "Translator's notes" }).tap();
  await expect(tip).toBeHidden();
});

test("the reader's search field grows over Translation, and a suggestion opens in the reader", async ({
  page,
}) => {
  await page.goto("/read/leb/genesis/2/18-25");
  const field = page.locator("st-search-input input");
  const translation = page.locator(".reader-menu-toggle");
  // Collapsed: a plain field left of Translation, no placeholder, no button.
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("placeholder", "");
  await expect(translation).toBeVisible();
  const searchButton = page.locator("st-search-input").getByRole("button", { name: "Search" });
  await expect(searchButton).toBeHidden();
  // A wide screen has it a fixed width (34rem), with no animation; a phone grows it to the row on
  // focus.
  const wideScreen = (page.viewportSize()?.width ?? 0) >= 600;
  const widthNow = async () => Math.round((await field.boundingBox())?.width ?? 0);
  // (Polled: the field is measured once the widget's own styles have applied.)
  if (wideScreen) await expect.poll(widthNow).toBe(544);
  else await expect.poll(widthNow).toBeLessThan(250);
  const narrow = await widthNow();
  await field.click();
  if (wideScreen) expect(await widthNow()).toBe(narrow);
  else
    await expect
      .poll(async () => (await field.boundingBox())?.width ?? 0)
      .toBeGreaterThan(narrow + 40);
  await expect(searchButton).toBeHidden();
  const wide = (await field.boundingBox())?.width ?? 0;
  // At the row's left edge, level with the bar.
  const bar = await page.locator(".reading-bar").boundingBox();
  expect(Math.abs(((await field.boundingBox())?.x ?? 0) - (bar?.x ?? 0))).toBeLessThan(12);
  await page.screenshot(shot("reader-search-focused"));
  // A suggestion's clipped line slides left while the mouse is on it (a phone has no hover).
  if (!page.viewportSize() || page.viewportSize()!.width >= 700) {
    await field.fill("in the beginning");
    const row = page
      .getByRole("option")
      .filter({ has: page.locator(".preview") })
      .first();
    await row.hover();
    const line = row.locator(".preview").first();
    const clipped = await line.evaluate((e) => e.scrollWidth > e.clientWidth);
    if (clipped) await expect.poll(() => line.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    await page.mouse.move(0, 0);
    if (clipped) await expect.poll(() => line.evaluate((e) => e.scrollLeft)).toBe(0);
  }
  // A suggestion goes to the reader.
  await field.fill("john 3");
  // Leaving the field closes the list; coming back shows it again for the same text.
  await expect(page.getByRole("option").first()).toBeVisible();
  await field.blur();
  await expect(page.getByRole("option")).toHaveCount(0);
  await field.focus();
  await expect(page.getByRole("option").first()).toBeVisible();
  // The suggestions are as wide as the row, not the field.
  const list = await page.locator("st-search-input").getByRole("listbox").boundingBox();
  const row = await page.locator(".reader-translations").boundingBox();
  expect(list?.width ?? 0).toBeGreaterThan(Math.min(row?.width ?? 0, 460) - 2);
  if ((page.viewportSize()?.width ?? 0) >= 700) expect(list?.width ?? 0).toBeGreaterThan(wide + 20);
  await page
    .getByRole("option", { name: /John 3/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/read\/leb\/john\/3$/);
});

test("a long passage name stays inside the chapter bar on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/read/leb/1-corinthians/1/3-18");
  const bar = await page.locator(".reading-bar").boundingBox();
  const title = await page.locator(".reading-title").boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(bar!.y - 1);
  expect(title!.y + title!.height).toBeLessThanOrEqual(bar!.y + bar!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("KJV Psalm 23: poetry lines and a Psalm title", async ({ page }) => {
  await page.goto("/read/eng-kjv/psalms/23");
  await expect(page.locator(".scripture .b-q1, .scripture .b-q2").first()).toBeVisible();
  await page.screenshot(shot("kjv-psalm-23"));
});

test("an unknown book is answered in words", async ({ page }) => {
  await page.goto("/read?t=leb&ref=Hezekiah%201");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "We couldn't find a book by that name.",
  );
  await page.screenshot(shot("error"));
});

test("vision §3.4: without a canon, books the traditions disagree on are labelled", async ({
  page,
}) => {
  await page.goto("/read/eng-web/tobit/1");
  await expect(
    page.getByText("Counted as scripture in some traditions, not in others."),
  ).toBeVisible();
  await page.goto("/read/eng-web/ruth/1");
  await expect(page.locator(".canon-note")).toHaveCount(0);
});

test("vision §3.4: the book list, then chapter by chapter", async ({ page }) => {
  await page.goto("/read/eng-web");
  await expect(page.getByRole("heading", { name: "Books of the WEB" })).toBeVisible();
  await expect(page.getByText("Sign in and choose your canon")).toBeVisible();
  // The books are the editor's tabs: a section at a time (Old Testament first), the books of
  // the one chosen below. Tobit is in the tab for books the traditions disagree on.
  const tabs = page.getByRole("tablist", { name: "Books by section" });
  await expect(tabs.getByRole("tab", { name: "Old Testament" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tabs.getByRole("tab", { name: "In some traditions" }).click();
  await expect(page.getByRole("link", { name: /^Tobit/ })).toBeVisible();
  await tabs.getByRole("tab", { name: "Old Testament" }).click();
  await page.screenshot(shot("books"));
  await page.getByRole("link", { name: /^Genesis/ }).click();
  await expect(page).toHaveURL(/\/read\/eng-web\/genesis\/1$/);
  // The passage page has the chapter bar over the text.
  await expect(page.locator(".reading-bar .chapter-button")).toHaveText("1");
  // The bar stays at the top of the window while the chapter scrolls.
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
  expect((await page.locator(".reading-bar").boundingBox())?.y).toBeLessThan(40);
  // The passage page has the books in the dropdown from the book's name, on the section of the
  // book being read.
  await page.locator(".reading-bar .book-dropdown-button").click();
  const genesis = page.locator("#book-dropdown-panel").getByRole("link", { name: /^Genesis/ });
  await expect(genesis).toHaveAttribute("aria-current", "page");
  // The book being read is highlighted in the list.
  await expect(genesis).toHaveCSS("background-color", "rgb(198, 233, 250)");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Next: Genesis 2" }).click();
  await expect(page).toHaveURL(/\/genesis\/2$/);
  await expect(page.getByRole("link", { name: "Previous: Genesis 1" })).toBeVisible();

  // Without a canon, the Old Testament runs on into the New.
  await page.goto("/read/eng-web/malachi/4");
  await expect(page.getByRole("link", { name: "Next: Matthew 1" })).toBeVisible();
});

test("the credits page names every asset and data source (branding.md §1)", async ({ page }) => {
  await page.goto("/credits");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { name: "Credits" })).toBeVisible();
  await expect(main.getByRole("link", { name: "The Big Username Blocklist" })).toBeVisible();
  await expect(main.getByRole("link", { name: "shouldbee/reserved-usernames" })).toBeVisible();
  // The original-language data's credit, as its CC BY licenses require.
  await expect(main.getByRole("link", { name: "STEPBible-Data" })).toHaveAttribute(
    "href",
    "https://www.STEPBible.org",
  );
  await expect(main.getByText("descriptions of the names were written by an AI")).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Open Scriptures Hebrew Bible Project" }),
  ).toBeVisible();
  await page.screenshot(shot("credits"));
});

test("stepping to the next or previous chapter starts it at its first verse", async ({ page }) => {
  await page.goto("/read/leb/john/4");
  // Script-driven links, and the step is noted by script.
  await page.waitForLoadState("networkidle");
  const scrollDown = () => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  /** The first verse is in the window, just under the sticky head. */
  const atFirstVerse = async () => {
    const head = await page.locator(".reader-head").boundingBox();
    const verse = await page.locator(".verse").first().boundingBox();
    const height = page.viewportSize()?.height ?? 600;
    return !!head && !!verse && verse.y >= head.y + head.height - 2 && verse.y < height;
  };
  await scrollDown();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await page.getByRole("link", { name: "Next: John 5" }).click();
  await expect(page).toHaveURL(/\/read\/leb\/john\/5$/);
  await expect.poll(atFirstVerse).toBe(true);
  // The same going back.
  await scrollDown();
  await page.getByRole("link", { name: "Previous: John 4" }).click();
  await expect(page).toHaveURL(/\/read\/leb\/john\/4$/);
  await expect.poll(atFirstVerse).toBe(true);
});

test("the passage in the chapter bar reads as one line of plain text", async ({ page }) => {
  await page.goto("/read/leb/1-corinthians/1/3-18");
  const bar = page.locator(".reading-bar");
  await expect(bar.locator(".book-dropdown-button")).toHaveCSS("border-top-width", "0px");
  await expect(bar.locator(".book-dropdown-button")).toHaveCSS("cursor", "pointer");
  await expect(bar.locator(".chapter-button")).toHaveCSS("border-top-width", "0px");
  // The book, chapter and verses sit on one line, the verses straight after the chapter.
  const chapter = await bar.locator(".chapter-button").boundingBox();
  const verses = await bar.getByRole("button", { name: "1 Corinthians 1:3–18" }).boundingBox();
  const middle = (b: { y: number; height: number } | null) => (b?.y ?? 0) + (b?.height ?? 0) / 2;
  expect(Math.abs(middle(verses) - middle(chapter))).toBeLessThan(4);
  expect((verses?.x ?? 0) - ((chapter?.x ?? 0) + (chapter?.width ?? 0))).toBeLessThan(8);
  // All of it the same size and weight.
  const look = (name: string) =>
    bar.locator(name).evaluate((e) => {
      const c = getComputedStyle(e);
      return `${c.fontSize} ${c.fontWeight}`;
    });
  expect(await look(".passage-title-button")).toBe(await look(".chapter-button"));
  expect(await look(".book-dropdown-button")).toBe(await look(".chapter-button"));
  expect((await look(".chapter-button")).endsWith(" 700")).toBe(true);
  // A whole chapter has no title button to click, but the page keeps its heading.
  await page.goto("/read/leb/genesis/2");
  await expect(page.locator(".reading-bar .passage-title-button")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Genesis 2" })).toHaveCount(1);
});

test("the chapter list stays open while the pointer moves from the chapter number onto it", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "needs a pointer");
  await page.goto("/read/leb/genesis/2");
  await page.waitForLoadState("networkidle");
  const button = page.locator(".reading-bar .chapter-button");
  const list = page.locator(".chapter-list");
  await button.hover();
  await expect(list).toBeVisible();
  const from = await button.boundingBox();
  const to = await list.getByRole("link").first().boundingBox();
  if (!from || !to) throw new Error("no boxes");
  // Straight down, a few pixels at a time, as a hand moves.
  const x = from.x + from.width / 2;
  const top = from.y + from.height / 2;
  const bottom = to.y + to.height / 2;
  for (let y = top; y <= bottom; y += 3) await page.mouse.move(x, y);
  await expect(list).toBeVisible();
  await expect(list.getByRole("link").first()).toBeVisible();
});
