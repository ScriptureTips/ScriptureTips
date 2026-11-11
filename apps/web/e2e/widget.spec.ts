import { expect, type Page, test } from "@playwright/test";
import { shot } from "./support.ts";

/**
 * The website plugin (vision §3.6, testing.md "Website widget"): a fixture page on another origin
 * loads the script from the site and links the references in the area it's told to, so CORS is
 * exercised for real. The script is built by `pnpm --filter @scripturetips/widget build`.
 */
const SCRIPT = "https://dev.scripturetips.com/widget/scripturetips.js";
/**
 * The page the script is put on: another origin from the site's, so the API's CORS answers are
 * needed. Every request to it is answered here. Chromium counts a page answered this way as
 * public and won't let it reach the dev site (a private address inside the stack), a rule about
 * local networks that a real public site loading the script doesn't meet, so that one check
 * is off for these tests.
 */
const FIXTURE = "https://fixture.test/";
test.use({
  launchOptions: {
    args: ["--disable-features=LocalNetworkAccessChecks"],
  },
});

const page$ = (
  extra = "",
  body = "",
) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture page</title>
<style>body { font: 18px/1.5 serif; margin: 1rem; } main { max-width: 32rem; }</style></head><body>
<main id="content">
  <p>See John 3:16 and Romans 5:8–10 today.</p>
  <p>Already <a href="/elsewhere">Genesis 1:1</a> is a link.</p>
  <p><code>Psalm 23</code> is in code.</p>
  <p class="st-ignore">Isaiah 53:5 is ignored.</p>
  <textarea>John 1:1</textarea>
  <p id="hebrew">Joel 2:28 is numbered differently.</p>
  ${body}
</main>
<aside id="side"><p>Matthew 5:3 is outside the area.</p></aside>
<script>window.events = [];</script>
<script src="${SCRIPT}"></script>
<script>
  ScriptureTips.on("tooltip-open", (e) => window.events.push(["open", e.reference, e.translation]));
  ScriptureTips.on("translation-change", (e) => window.events.push(["translation", e.translation]));
  ScriptureTips.on("scan", (e) => window.events.push(["scan", e.linked]));
  ScriptureTips.run("#content");
  ${extra}
</script></body></html>`;

async function open(page: Page, html = page$()) {
  await page.route(`${FIXTURE}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html }),
  );
  await page.goto(FIXTURE);
  await expect(page.locator("#content a.st-ref").first()).toBeVisible();
}

const tooltip = (page: Page) => page.getByRole("dialog", { name: "Scripture passage" });

test("vision §3.6: the plugin links the references in the area it's given, and leaves the rest", async ({
  page,
}) => {
  await open(page);
  const links = page.locator("#content a.st-ref");
  await expect(links).toHaveText(["John 3:16", "Romans 5:8–10", "Joel 2:28"]);
  // The page's own link isn't touched or nested; code, ignored text and fields are left alone.
  await expect(page.locator('a[href="/elsewhere"]')).toHaveText("Genesis 1:1");
  await expect(page.locator('a[href="/elsewhere"] a')).toHaveCount(0);
  await expect(page.locator("#content code a, #content .st-ignore a")).toHaveCount(0);
  expect(await page.locator("textarea").inputValue()).toBe("John 1:1");
  // Outside the area, nothing.
  await expect(page.locator("#side a")).toHaveCount(0);
  // A link goes to the ScriptureTips reader, which reads the reference as written.
  await expect(links.first()).toHaveAttribute(
    "href",
    "https://dev.scripturetips.com/read?t=eng-kjv&ref=John%203%3A16",
  );
});

test("vision §3.6: hovering a reference shows the passage, in the visitor's browser alone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "A phone has no hover: its tap is tested below.");
  await open(page);
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).hover();
  const pop = tooltip(page);
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("heading", { name: "John 3:16" })).toBeVisible();
  await expect(pop).toContainText("For God so loved the world");
  await expect(pop.getByRole("combobox", { name: "Translation" })).toHaveValue("eng-kjv");
  await expect(pop.getByRole("link", { name: "Read more" })).toHaveAttribute(
    "href",
    "https://dev.scripturetips.com/read?t=eng-kjv&ref=John+3%3A16",
  );
  await page.screenshot(shot("widget-tooltip"));
  // No cookie goes to the site, nothing is stored on the page's origin.
  expect(await page.context().cookies("https://dev.scripturetips.com")).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  // It stays while the pointer is over it, and goes when it leaves.
  await pop.hover();
  await page.waitForTimeout(500);
  await expect(pop).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(pop).toBeHidden();
  // Escape closes it too.
  await page.locator("#content a.st-ref").first().hover();
  await expect(pop).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
});

test("vision §3.6: the tooltip switches translation, shows what the license asks, and tells the page", async ({
  page,
}) => {
  await open(page);
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).focus();
  const pop = tooltip(page);
  await expect(pop).toBeVisible();
  await pop.getByRole("combobox", { name: "Translation" }).selectOption({ label: "LEB" });
  await expect(pop.getByRole("heading", { name: "John 3:16" })).toBeVisible();
  // The LEB's license asks for its credit statement, with its links.
  await expect(pop).toContainText("Lexham English Bible");
  await expect(pop.getByRole("link", { name: "Logos Bible Software" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { events: unknown[][] }).events)).toEqual(
    expect.arrayContaining([
      ["open", "John.3.16", "eng-kjv"],
      ["translation", "leb"],
      ["open", "John.3.16", "leb"],
    ]),
  );
});

test("vision §3.6: the tooltip stays while a translation is chosen, though the choices open outside it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "A phone's choices are its own sheet.");
  await open(page);
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).hover();
  const pop = tooltip(page);
  await expect(pop).toBeVisible();
  // Using the select: it has the focus, and its choices open away from the tooltip, so the
  // pointer is off it.
  const select = pop.getByRole("combobox", { name: "Translation" });
  await select.focus();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(600);
  await expect(pop).toBeVisible();
  // Choosing another keeps it, with the new passage.
  await select.selectOption({ label: "BSB" });
  await expect(pop.getByRole("heading", { name: "John 3:16" })).toBeVisible();
  await expect(pop.getByRole("combobox", { name: "Translation" })).toHaveValue("bsb");
  await page.waitForTimeout(600);
  await expect(pop).toBeVisible();
  // It isn't held after that: the pointer going into it and out puts it away.
  await pop.hover();
  await page.mouse.move(5, 5);
  await expect(pop).toBeHidden();
});

test("vision §3.6: a pinned tooltip stays open, on its passage, while the reader writes elsewhere", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "A phone has no hover.");
  await open(
    page,
    page$(
      "",
      `<div style="height:1600px"></div><textarea id="reply" aria-label="Reply"></textarea>`,
    ),
  );
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).hover();
  const pop = tooltip(page);
  await expect(pop.getByText("For God so loved the world")).toBeVisible();
  // The pin is beside the translation picker, on its right.
  const pin = pop.getByRole("button", { name: "Keep open" });
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  const [select, pinBox] = await Promise.all([
    pop.getByRole("combobox", { name: "Translation" }).boundingBox(),
    pin.boundingBox(),
  ]);
  expect(select && pinBox && pinBox.x >= select.x + select.width).toBe(true);
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await page.screenshot(shot("widget-pinned"));
  // The pointer leaves, crosses another passage, and the reader goes to write a reply below.
  await page.mouse.move(5, 5);
  await page.locator("#content a.st-ref", { hasText: "Romans 5:8" }).hover();
  await page.waitForTimeout(600);
  const reply = page.getByRole("textbox", { name: "Reply" });
  await reply.click();
  await reply.pressSequentially("As it says, ");
  await page.keyboard.press("Escape");
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("heading", { name: "John 3:16" })).toBeVisible();
  // Its link is scrolled away, but it stays in the window.
  const tip = await pop.boundingBox();
  const view = page.viewportSize();
  expect(tip && view && tip.y >= 0 && tip.y + tip.height <= view.height).toBe(true);
  await expect(reply).toHaveValue("As it says, ");
  // Unpinned, it goes as usual when the pointer leaves, and the next opens unpinned.
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(5, 5);
  await expect(pop).toBeHidden();
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).hover();
  await expect(pop.getByRole("button", { name: "Keep open" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("vision §3.6: the pin works from the keyboard, and Escape in the tooltip closes it pinned", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "A phone has no keyboard here.");
  await open(page);
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).focus();
  const pop = tooltip(page);
  const pin = pop.getByRole("button", { name: "Keep open" });
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await expect(pin).toBeFocused();
  // Another translation rebuilds the tooltip: the pin keeps its state.
  await pop.getByRole("combobox", { name: "Translation" }).selectOption({ label: "BSB" });
  await expect(pop.getByRole("button", { name: "Keep open" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await pop.getByRole("button", { name: "Keep open" }).focus();
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
});

const chosenIn = (page: Page) => tooltip(page).getByRole("combobox", { name: "Translation" });

test("vision §3.6: a translation written after the passage, or in the link's own address, is where it opens", async ({
  page,
}) => {
  await open(
    page,
    page$(
      "",
      `<p>Isaiah 53:5 (BSB) and Mark 1:1 (NLT) are quoted.</p>
       <p><a class="st-ref" href="https://dev.scripturetips.com/read?t=leb&amp;ref=Romans%205%3A8" data-st-ref="Rom.5.8" data-st-text="Romans 5:8">Romans 5:8</a> is the page's own link.</p>`,
    ),
  );
  // "(BSB)" after the passage names a translation the plugin has.
  await page.locator("#content a.st-ref", { hasText: "Isaiah 53:5" }).focus();
  await expect(chosenIn(page)).toHaveValue("bsb");
  await page.keyboard.press("Escape");
  // "(NLT)" isn't one it has: the default (the KJV) is used.
  await page.locator("#content a.st-ref", { hasText: "Mark 1:1" }).focus();
  await expect(chosenIn(page)).toHaveValue("eng-kjv");
  await page.keyboard.press("Escape");
  // A link whose address names one: that one, even over the visitor's preference.
  await page.evaluate(() => {
    (
      window as unknown as { ScriptureTips: { setPreferences: (p: object) => void } }
    ).ScriptureTips.setPreferences({ translation: "bsb" });
  });
  await page.locator('a.st-ref[data-st-ref="Rom.5.8"]').focus();
  await expect(chosenIn(page)).toHaveValue("leb");
  await page.keyboard.press("Escape");
  // The visitor's preference is next, for a passage nothing else speaks of.
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).focus();
  await expect(chosenIn(page)).toHaveValue("bsb");
});

/** A page with nothing but what the test puts in the area. */
const bare = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture page</title>
<style>body { font: 18px/1.5 serif; margin: 1rem; } main { max-width: 32rem; }</style></head><body>
<main id="content">${body}</main>
<script src="${SCRIPT}"></script><script>ScriptureTips.run("#content");</script></body></html>`;

test("vision §3.6: two copies close together are reached one after the other, each with its own translation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "A phone has no hover.");
  await open(
    page,
    bare(`<p style="margin-top:320px">First: Mark 1:1 here.</p><p>Second: Mark 1:1 here.</p>`),
  );
  const links = page.locator("#content a.st-ref");
  const pop = tooltip(page);
  const select = pop.getByRole("combobox", { name: "Translation" });
  // The pointer moves to a link as a real one does: the tooltip may be in the way.
  const at = async (i: number) => {
    const box = await links.nth(i).boundingBox();
    if (!box) throw new Error("No link.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };
  await at(0);
  await expect(pop).toBeVisible();
  // The link being looked at is outlined, and the tooltip isn't over the other one.
  await expect(links.nth(0)).toHaveAttribute("aria-expanded", "true");
  const tip = await pop.boundingBox();
  const second = await links.nth(1).boundingBox();
  expect(tip && second && tip.y + tip.height <= second.y).toBe(true);
  await select.selectOption({ label: "BSB" });
  await expect(select).toHaveValue("bsb");
  // On to the second: it opens its own, not the first's.
  await at(1);
  await expect(links.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(links.nth(0)).not.toHaveAttribute("aria-expanded", "true");
  await expect(select).toHaveValue("eng-kjv");
  await select.selectOption({ label: "LEB" });
  await expect(select).toHaveValue("leb");
  await at(0);
  await expect(select).toHaveValue("bsb");
  await at(1);
  await expect(select).toHaveValue("leb");
  expect(
    JSON.parse(
      (await page.evaluate(() => localStorage.getItem("scripturetips:translations"))) ?? "{}",
    ),
  ).toEqual({ "/|Mark.1.1|0": "bsb", "/|Mark.1.1|1": "leb" });
});

test("vision §3.6: two copies of one passage on a page each keep their own translation", async ({
  page,
}) => {
  await open(page, page$("", `<p id="again">Quoted again: John 3:16 a second time.</p>`));
  const first = page.locator("#content a.st-ref", { hasText: "John 3:16" }).first();
  const second = page.locator("#again a.st-ref");
  await first.focus();
  await chosenIn(page).selectOption({ label: "BSB" });
  await expect(tooltip(page).getByRole("heading", { name: "John 3:16" })).toBeVisible();
  await page.keyboard.press("Escape");
  // The other copy isn't changed by it.
  await second.focus();
  await expect(chosenIn(page)).toHaveValue("eng-kjv");
  await chosenIn(page).selectOption({ label: "LEB" });
  await expect(tooltip(page).getByRole("heading", { name: "John 3:16" })).toBeVisible();
  await page.keyboard.press("Escape");
  // Each opens as it was left, each link's address names its own, and so after a reload.
  await first.focus();
  await expect(chosenIn(page)).toHaveValue("bsb");
  await page.keyboard.press("Escape");
  await expect(first).toHaveAttribute("href", /[?&]t=bsb&/);
  await expect(second).toHaveAttribute("href", /[?&]t=leb&/);
  await page.reload();
  await expect(second).toBeVisible();
  await first.focus();
  await expect(chosenIn(page)).toHaveValue("bsb");
  await page.keyboard.press("Escape");
  await second.focus();
  await expect(chosenIn(page)).toHaveValue("leb");
  expect(
    JSON.parse(
      (await page.evaluate(() => localStorage.getItem("scripturetips:translations"))) ?? "{}",
    ),
  ).toEqual({ "/|John.3.16|0": "bsb", "/|John.3.16|1": "leb" });
});

test("vision §3.6: each passage keeps the translation the reader chose for it, after a reload too", async ({
  page,
}) => {
  await open(page);
  // Nothing is stored until the reader chooses.
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).focus();
  await chosenIn(page).selectOption({ label: "BSB" });
  await expect(tooltip(page).getByRole("heading", { name: "John 3:16" })).toBeVisible();
  await page.keyboard.press("Escape");
  // Another passage isn't changed by it, and has its own choice.
  await page.locator("#content a.st-ref", { hasText: "Romans 5:8" }).focus();
  await expect(chosenIn(page)).toHaveValue("eng-kjv");
  await chosenIn(page).selectOption({ label: "LEB" });
  await expect(tooltip(page).getByRole("heading", { name: "Romans 5:8–10" })).toBeVisible();
  await page.keyboard.press("Escape");
  // Kept in the reader's own browser, by link: the page, the passage and which copy of it.
  expect(
    JSON.parse(
      (await page.evaluate(() => localStorage.getItem("scripturetips:translations"))) ?? "{}",
    ),
  ).toEqual({ "/|John.3.16|0": "bsb", "/|Rom.5.8-Rom.5.10|0": "leb" });
  // Hidden and shown again, and after a reload, each opens as it was left.
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).focus();
  await expect(chosenIn(page)).toHaveValue("bsb");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("#content a.st-ref").first()).toBeVisible();
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).focus();
  await expect(chosenIn(page)).toHaveValue("bsb");
  await page.keyboard.press("Escape");
  await page.locator("#content a.st-ref", { hasText: "Romans 5:8" }).focus();
  await expect(chosenIn(page)).toHaveValue("leb");
  // Links name the choice too.
  await expect(page.locator("#content a.st-ref", { hasText: "John 3:16" })).toHaveAttribute(
    "href",
    /[?&]t=bsb&/,
  );
});

test("domain-model §2.2: a reference in the KJV's numbering is shown in the translation's own", async ({
  page,
}) => {
  await open(page);
  await page.locator("#content a.st-ref", { hasText: "Joel 2:28" }).focus();
  const pop = tooltip(page);
  await expect(pop.getByRole("heading", { name: "Joel 2:28" })).toBeVisible();
  // The JPS (1917) numbers it in the Hebrew's way: Joel 3:1.
  await pop.getByRole("combobox", { name: "Translation" }).selectOption({ label: "JPS" });
  await expect(pop.getByRole("heading", { name: "Joel 3:1" })).toBeVisible();
  await expect(pop).toContainText("pour out My spirit");
  // Read more opens it where the reader numbers it so.
  await expect(pop.getByRole("link", { name: "Read more" })).toHaveAttribute(
    "href",
    /\/read\?t=jps1917&ref=Joel\+3%3A1/,
  );
});

test("vision §3.6: what is added later is linked, and rescan and the preferences work", async ({
  page,
}) => {
  await open(page);
  // Added to the area after the script ran.
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.id = "late";
    p.textContent = "Later: Mark 1:1 appeared.";
    document.querySelector("#content")?.append(p);
  });
  await expect(page.locator("#late a.st-ref")).toHaveText("Mark 1:1");
  // The page's other area is only scanned when it asks.
  await expect(page.locator("#side a")).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { ScriptureTips: { rescan: (e: Element) => void } }).ScriptureTips.rescan(
      document.querySelector("#side") as Element,
    );
  });
  await expect(page.locator("#side a.st-ref")).toHaveText("Matthew 5:3");
  // The visitor's preference (a site with accounts passes it): links name it, the tooltip opens with it.
  await page.evaluate(() => {
    (
      window as unknown as { ScriptureTips: { setPreferences: (p: object) => void } }
    ).ScriptureTips.setPreferences({ translation: "bsb" });
  });
  await expect(page.locator("#content a.st-ref").first()).toHaveAttribute("href", /[?&]t=bsb&/);
  await page.locator("#content a.st-ref").first().focus();
  await expect(tooltip(page).getByRole("combobox", { name: "Translation" })).toHaveValue("bsb");
});

test("vision §3.6: on a phone the first tap opens the passage, and Read more is the way on", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "A tap is a phone's way in.");
  await open(page);
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).tap();
  const pop = tooltip(page);
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("For God so loved the world");
  // The tap didn't follow the link.
  expect(page.url()).toBe(FIXTURE);
  const box = await pop.boundingBox();
  const size = page.viewportSize();
  expect(box && size && box.x >= 0 && box.x + box.width <= size.width).toBe(true);
  await page.screenshot({ ...shot("widget-tooltip-phone"), fullPage: false });
  // Read more opens the reader.
  const popup = page.waitForEvent("popup");
  await pop.getByRole("link", { name: "Read more" }).tap();
  const reader = await popup;
  await expect(reader).toHaveURL(/\/read\/eng-kjv\/john\/3\/16/);
  // A tap elsewhere puts it away.
  await page
    .locator("#content p")
    .first()
    .tap({ position: { x: 5, y: 5 } });
  await expect(pop).toBeHidden();
});

test("vision §3.6: on a phone, a pinned tooltip stays through taps elsewhere and on other passages", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "A tap is a phone's way in.");
  await open(page, page$("", `<textarea id="reply" aria-label="Reply"></textarea>`));
  await page.locator("#content a.st-ref", { hasText: "John 3:16" }).tap();
  const pop = tooltip(page);
  await expect(pop).toContainText("For God so loved the world");
  const pin = pop.getByRole("button", { name: "Keep open" });
  await pin.tap();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ ...shot("widget-pinned-phone"), fullPage: false });
  await page.getByRole("textbox", { name: "Reply" }).tap();
  // Another passage isn't opened over it, nor followed: the pin is the way out.
  await page.locator("#content a.st-ref", { hasText: "Romans 5:8" }).tap();
  expect(page.url()).toBe(FIXTURE);
  await expect(pop.getByRole("heading", { name: "John 3:16" })).toBeVisible();
  await pin.tap();
  await page
    .locator("#content p")
    .first()
    .tap({ position: { x: 5, y: 5 } });
  await expect(pop).toBeHidden();
});
