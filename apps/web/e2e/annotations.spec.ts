import { expect as baseExpect, type Locator, type Page, test } from "@playwright/test";
import { arriveFromOwnAddress, openNewCompilation, shot, signUp } from "./support.ts";

arriveFromOwnAddress();

const expect = baseExpect.configure({ timeout: 15_000 });

/** Waits until the page's scripts have run. */
const settled = (page: Page) => page.waitForLoadState("networkidle");

async function create(page: Page, title: string, abbreviation: string) {
  await signUp(page);
  await page.goto("/compilations");
  await openNewCompilation(page);
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("textbox", { name: "Abbreviation" }).fill(abbreviation);
  await page.getByRole("combobox", { name: "Base translation" }).selectOption("eng-kjv");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`/compilations/${abbreviation.toLowerCase()}$`), {
    timeout: 15_000,
  });
}

/**
 * An annotation on "Eve" in the compilation's own wording of Genesis 4:1 (KJV: "And Adam knew Eve
 * his wife"), and a link from Genesis 4:25 to 5:1 not pinned to words, made through the API as
 * study mode would; and collections, by title. Both items start in the default collection.
 */
async function makeNotes(page: Page, collections: readonly string[] = []) {
  await page.evaluate(async (titles) => {
    const post = (url: string, body: object) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    await post("/api/annotations", {
      compilation: "mine",
      source: "Gen.4.1",
      body: "The mother of all living",
      quote: "Eve",
      anchor: {
        in: "@compilation",
        compilation: "mine",
        start: { verse: "Gen.4.1", offset: 14 },
        end: { verse: "Gen.4.1", offset: 17 },
      },
    });
    await post("/api/links", { compilation: "mine", source: "Gen.4.25", target: "Gen 5:1" });
    for (const title of titles) await post("/api/collections", { title });
  }, collections);
}

/**
 * Opens an item from its line: pressed at its end, clear of its passages, which are the plugin's
 * links (they show their tooltips) over the line's button.
 */
async function openLine(within: Locator, how: "click" | "tap" = "click") {
  const open = within.locator("button.annotation-open");
  const at = await open.boundingBox();
  if (!at) throw new Error("No line to open.");
  const position = { x: at.width - 4, y: at.height / 2 };
  await (how === "tap" ? open.tap({ position }) : open.click({ position }));
}

/** A collection's box, by its title. */
const box = (page: Page, title: string) =>
  page
    .locator("section.annotation-box")
    .filter({ has: page.getByRole("heading", { name: new RegExp(`^${title} \\(`) }) });

/** A box's heading button (which opens it, or takes a drop). */
const head = (b: Locator) => b.getByRole("heading").getByRole("button");

/** Selects the first `word` in a region's verses, as the user would by dragging over it. */
async function selectWord(region: Locator, word: string) {
  await region.evaluate((root, w) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest(".verse-words")) continue;
      const at = node.textContent?.indexOf(w) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + w.length);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      return;
    }
    throw new Error(`No ${w}.`);
  }, word);
}

/** The words a highlight is drawn on now. */
const painted = (page: Page, name: string) =>
  page.evaluate(
    (n) => [...(CSS.highlights.get(n) ?? [])].map((r) => (r as Range).toString()),
    name,
  );

/** Drags with the mouse from an element's middle to another's, pausing to check on the way. */
async function dragTo(page: Page, from: Locator, to: Locator, midway?: () => Promise<void>) {
  const a = await from.boundingBox();
  if (!a) throw new Error("Nothing to drag.");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 20, { steps: 4 });
  await midway?.();
  const b = await to.boundingBox();
  if (!b) throw new Error("Nowhere to drop.");
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("vision §3.7.2: a long annotation stays on its one line, cut off, and nothing widens the page", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await create(page, "Long", "Mine");
  await page.evaluate(async () => {
    const post = (url: string, body: object) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    await post("/api/annotations", {
      compilation: "mine",
      source: "Gen.4.1",
      body: `${"Mother of all living, ".repeat(12)}https://example.org/${"a".repeat(160)}`,
      quote: "Eve",
      anchor: {
        in: "@compilation",
        compilation: "mine",
        start: { verse: "Gen.4.1", offset: 14 },
        end: { verse: "Gen.4.1", offset: 17 },
      },
    });
    await post("/api/collections", { title: `Study${"x".repeat(75)}` });
  });
  await page.goto("/annotations");
  await settled(page);
  await head(box(page, "Default collection")).click();
  const line = page.locator(".annotation-line");
  await expect(line).toHaveCount(1);
  // The line is cut off (its text is wider than it), and the page doesn't scroll sideways.
  expect(await line.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const sideways = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  expect(await sideways()).toBe(false);
  // A long collection name wraps, and its count stays whole on one line.
  const count = box(page, "Study[x]+").locator(".annotation-box-count");
  expect((await count.boundingBox())?.height).toBeLessThan(40);
  // The copy-or-link prompt's title wraps within it too.
  await page.locator("button.annotation-handle").focus();
  await page.keyboard.press("Enter");
  await head(box(page, "Study[x]+")).click();
  const prompt = page.getByRole("dialog", { name: /^Copy or move into/ });
  await expect(prompt).toBeVisible();
  expect(
    await prompt.evaluate((d) => {
      const title = d.querySelector("h2");
      return title ? title.scrollWidth <= title.clientWidth : false;
    }),
  ).toBe(true);
  expect(await sideways()).toBe(false);
});

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "The desktop layout.");

  test("vision §3.7.2: a new annotation or link is made on words chosen in a passage, never an empty one", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await create(page, "Added", "Mine");
    // From the user menu (pressed again until it opens: the first press can come before the
    // page's script has run).
    await settled(page);
    const item = page.getByRole("menuitem", { name: "Annotations" });
    await expect(async () => {
      await page.locator(".account-menu-toggle").click();
      await expect(item).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await item.click();
    await expect(page).toHaveURL(/\/annotations$/);
    await settled(page);
    // The introduction: what's here, dragging by the handle (drawn as on a line), and editing.
    await expect(page.locator("main p").filter({ hasText: "by dragging its handle" })).toHaveText(
      "Copy, link or move links from one collection to another by dragging its handle: ⠿.",
    );
    await expect(page.getByText("Click to edit the link and notes.")).toBeVisible();
    // A collection is made in its own modal: a title, and a description (the translation's
    // preface, up to 2000 characters).
    await page.getByRole("button", { name: "New collection" }).click();
    const making = page.getByRole("dialog", { name: "New collection" });
    await making.getByRole("textbox", { name: "Title" }).fill("Study Bible");
    const description = making.getByRole("textbox", { name: /^Description/ });
    expect(await description.evaluate((el) => (el as HTMLTextAreaElement).maxLength)).toBe(2000);
    await description.fill("Notes for a study edition.");
    await page.screenshot(shot("annotations-new-collection"));
    await making.getByRole("button", { name: "Create" }).click();
    await expect(making).toBeHidden();
    // What just happened shows as a toast at the foot of the window, and goes by itself.
    await expect(page.getByRole("status")).toHaveText("Saved.");
    const toast = page.locator(".toast");
    const at = await toast.boundingBox();
    const view = page.viewportSize();
    if (!at || !view) throw new Error("No toast.");
    expect(at.y + at.height).toBeGreaterThan(view.height - 80);
    await page.screenshot(shot("annotations-toast"));
    await expect(toast).toHaveCount(0, { timeout: 8_000 });
    const study = box(page, "Study Bible");
    await expect(head(study)).toHaveAccessibleName("Study Bible (0 items)");
    const made = await page.evaluate(async () => (await fetch("/api/collections")).json());
    expect(made.collections).toEqual([
      expect.objectContaining({ title: "Study Bible", description: "Notes for a study edition." }),
    ]);
    // A title already taken is refused in the modal, keeping what was typed.
    await page.getByRole("button", { name: "New collection" }).click();
    await making.getByRole("textbox", { name: "Title" }).fill("Study Bible");
    await making.getByRole("button", { name: "Create" }).click();
    await expect(making.getByRole("alert")).toBeVisible();
    await expect(making.getByRole("textbox", { name: "Title" })).toHaveValue("Study Bible");
    await making.getByRole("button", { name: "Close" }).click();
    await expect(making).toBeHidden();

    // An open collection's Add makes an annotation in it.
    await head(study).click();
    await study.getByRole("button", { name: "Add an annotation to Study Bible" }).click();
    const dialog = page.getByRole("dialog", { name: "New annotation" });
    await dialog
      .getByRole("combobox", { name: "Collection" })
      .selectOption({ label: "Study Bible" });
    await dialog.getByRole("combobox", { name: "Translation" }).selectOption({ label: "KJV" });
    // Enter in the reference field shows its verses (it doesn't save).
    await dialog.getByRole("textbox", { name: "Verse or passage", exact: true }).fill("Gen 4:1");
    await dialog.getByRole("textbox", { name: "Verse or passage", exact: true }).press("Enter");
    const verses = dialog.getByRole("region", { name: "Genesis 4:1 (KJV)" });
    await expect(verses).toContainText("Eve");
    const save = dialog.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();
    await selectWord(verses, "Eve");
    await expect(dialog).toContainText("Selected: “Eve”");
    await expect.poll(() => painted(page, "annotation-picked")).toEqual(["Eve"]);
    // Words alone are an empty annotation.
    await expect(dialog).toContainText("an annotation can't be empty");
    await expect(save).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: "Comment (optional)" })
      .fill("The mother of all living");
    // The words stay marked when the selection has gone (typing in the comment).
    await expect.poll(() => painted(page, "annotation-picked")).toEqual(["Eve"]);
    await expect(save).toBeEnabled();
    await page.screenshot(shot("annotations-add"));
    // Another translation: the words chosen in the last one are gone, so Save waits again.
    await dialog.getByRole("combobox", { name: "Translation" }).selectOption({ label: "ASV" });
    await expect(verses).toHaveCount(0);
    await expect(save).toBeDisabled();
    await expect.poll(() => painted(page, "annotation-picked")).toEqual([]);
    await dialog.getByRole("combobox", { name: "Translation" }).selectOption({ label: "KJV" });
    await dialog.getByRole("button", { name: "Show" }).click();
    await expect(verses).toContainText("Eve");
    await selectWord(verses, "Eve");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Annotation added.");
    await expect(head(study)).toHaveAccessibleName("Study Bible (1 item)");
    const rows = study.locator("li.annotation-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator(".annotation-line")).toHaveText(
      "Genesis 4:1 “Eve” The mother of all living",
    );
    await expect(rows.first().getByRole("button", { name: /^KJV: / })).toHaveText("KJV");

    // A link with no comment, from the collection's own Add.
    await study.getByRole("button", { name: "Add an annotation to Study Bible" }).click();
    await expect(dialog.getByRole("combobox", { name: "Collection" })).toHaveValue(
      await study.getAttribute("data-drop-collection").then((v) => v ?? ""),
    );
    await dialog.getByRole("combobox", { name: "Translation" }).selectOption({ label: "KJV" });
    await dialog
      .getByRole("textbox", { name: "Verse or passage", exact: true })
      .fill("Genesis 4:25");
    await dialog.getByRole("button", { name: "Show" }).click();
    const seth = dialog.getByRole("region", { name: "Genesis 4:25 (KJV)" });
    await expect(seth).toContainText("Seth");
    await selectWord(seth, "Seth");
    await dialog.getByRole("textbox", { name: /^Link to another passage/ }).fill("Gen 5:3");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Link added.");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1).locator(".annotation-line")).toHaveText(
      "Genesis 4:25 “Seth” → Genesis 5:3",
    );
    await expect(head(box(page, "Default collection"))).toHaveAccessibleName(
      "Default collection (0 items)",
    );
    await page.screenshot(shot("annotations"));
  });

  test("vision §3.7.2: an annotation is edited, and moved or copied to another translation on the words chosen there", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await create(page, "Moved", "Mine");
    await makeNotes(page);
    await page.goto("/annotations");
    await settled(page);
    const def = box(page, "Default collection");
    await head(def).click();
    const rows = def.locator("li.annotation-row");
    await expect(rows).toHaveCount(2);
    // The row of "Eve" in a wording, by the abbreviation on it (a compilation's is shown as it was
    // entered: either case matches), and its two buttons: the line (to edit it) and the
    // abbreviation (its translation).
    const row = (wording: string) =>
      rows.filter({
        has: page.getByRole("button", { name: new RegExp(`^${wording}: .*Genesis 4:1`, "i") }),
      });
    const eve = (wording: string) => row(wording).locator(".annotation-line");
    const wordingOf = (wording: string) => row(wording).locator("button.annotation-wording");
    const dialog = page.getByRole("dialog", { name: "Annotation" });

    // Its passage shows its text in the plugin's tooltip, in the translation its words are in (a
    // compilation's own wording: its base).
    const pop = page.getByRole("dialog", { name: "Scripture passage" });
    await eve("MINE").locator("a.st-ref", { hasText: "Genesis 4:1" }).hover();
    await expect(pop).toContainText("Eve his wife");
    await expect(pop.getByRole("combobox", { name: "Translation" })).toHaveValue("eng-kjv");
    await page.screenshot(shot("annotations-list-tooltip"));
    await page.mouse.move(5, 5);
    await expect(pop).toBeHidden();
    await openLine(eve("MINE"));
    await expect(dialog.getByRole("textbox", { name: "Text" })).toHaveValue(
      "The mother of all living",
    );
    // Its translation isn't changed here (but from the abbreviation), nor is it deleted here (but
    // from the trash icon on its line).
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await page.screenshot(shot("annotations-edit"));
    await dialog.getByRole("textbox", { name: "Text" }).fill("Mother of all living");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await expect(eve("MINE")).toContainText("Mother of all living");

    // The abbreviation opens its translation: the verse in full, its words marked.
    const wordings: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/annotations/wording")) wordings.push(r.url());
    });
    const translation = page.getByRole("dialog", { name: "Translation" });
    await wordingOf("MINE").click();
    await expect(translation.getByRole("region", { name: /^Now in MINE/i })).toHaveText(
      /And Adam knew Eve his wife; and she conceived, and bare Cain, and said, I have gotten a man from the LORD\./,
    );
    await expect.poll(() => painted(page, "annotation-current")).toEqual(["Eve"]);
    await expect(translation.getByRole("button", { name: "Copy", exact: true })).toHaveCount(0);
    // Copied to the ASV, on the same words chosen there.
    await translation.getByRole("combobox", { name: "Move or copy to" }).selectOption({
      label: "ASV",
    });
    await expect(translation).toContainText(
      "Choose Copy if you want this annotation in both translations, otherwise choose Move.",
    );
    await page.screenshot(shot("annotations-translation"));
    await translation.getByRole("button", { name: "Copy", exact: true }).click();
    const asv = translation.getByRole("region", { name: "ASV" });
    await expect(asv).toContainText("Eve");
    const copy = translation.getByRole("button", { name: "Copy to these words" });
    await expect(copy).toBeDisabled();
    await selectWord(asv, "Eve");
    await expect.poll(() => painted(page, "annotation-picked")).toEqual(["Eve"]);
    // The words now stay shown, and marked.
    await expect.poll(() => painted(page, "annotation-current")).toEqual(["Eve"]);
    // Each wording's verses are fetched, then no more (twice in development: React runs an
    // effect, its cleanup and the effect again).
    await page.waitForTimeout(500);
    const fetched = wordings.length;
    await page.waitForTimeout(1_000);
    expect(wordings).toHaveLength(fetched);
    expect(fetched).toBeLessThanOrEqual(4);
    await page.screenshot(shot("annotations-copy-to-translation"));
    await copy.click();
    await expect(translation).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Copied.");
    await expect(rows).toHaveCount(3);
    await expect(eve("ASV")).toHaveText("Genesis 4:1 “Eve” Mother of all living");

    // Moved to the WEB: the same item, on the WEB's words.
    await wordingOf("MINE").click();
    await translation.getByRole("combobox", { name: "Move or copy to" }).selectOption({
      label: "WEB",
    });
    await translation.getByRole("button", { name: "Move", exact: true }).click();
    const web = translation.getByRole("region", { name: "WEB" });
    await expect(web).toContainText("Eve");
    await selectWord(web, "Eve");
    await translation.getByRole("button", { name: "Move to these words" }).click();
    await expect(page.getByRole("status")).toHaveText("Moved.");
    await expect(rows).toHaveCount(3);
    await expect(eve("WEB")).toHaveCount(1);
    await expect(eve("MINE")).toHaveCount(0);
    // Its passage now opens in the WEB.
    await eve("WEB").locator("a.st-ref", { hasText: "Genesis 4:1" }).hover();
    await expect(pop.getByRole("combobox", { name: "Translation" })).toHaveValue("eng-web");
    await page.mouse.move(5, 5);
    await expect(pop).toBeHidden();

    // A link not pinned to words: its note and target change (and it's pinned to words below).
    // Its abbreviation is where it's read: the compilation's own wording.
    const unpinned = rows.filter({ hasText: "Genesis 4:25" });
    await expect(unpinned.locator("button.annotation-wording")).toHaveText("Mine");
    const link = page.getByRole("dialog", { name: "Link" });
    await openLine(unpinned);
    // It starts with its verse in full.
    await expect(link.getByRole("region", { name: "Genesis 4:25" })).toContainText(
      "And Adam knew his wife again",
    );
    // Its passages show their text in the website plugin's tooltip, in the modal (it can be used).
    await link.locator("a.st-ref", { hasText: "Genesis 5:1" }).hover();
    await expect(pop).toContainText("This is the book of the generations of Adam");
    // Over the modal, where a press reaches it (a trial click fails when something else is on top).
    await pop.getByRole("heading", { name: "Genesis 5:1" }).click({ trial: true, timeout: 3_000 });
    await pop.getByRole("combobox", { name: "Translation" }).selectOption("eng-web");
    await expect(pop.getByRole("combobox", { name: "Translation" })).toHaveValue("eng-web");
    await page.screenshot(shot("annotations-link-tooltip"));
    // Escape closes the tooltip, not the modal.
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
    await expect(link).toBeVisible();
    // A pinned one stays while the focus is elsewhere, so Escape then closes the modal.
    await link.locator("a.st-ref", { hasText: "Genesis 5:1" }).hover();
    await pop.getByRole("button", { name: "Keep open" }).click();
    await link.getByRole("textbox", { name: "Note" }).focus();
    await page.keyboard.press("Escape");
    await expect(link).toBeHidden();
    // The tooltip pinned in the modal went with it: a passage in the list shows only its own.
    await eve("WEB").locator("a.st-ref", { hasText: "Genesis 4:1" }).hover();
    await expect(pop).toHaveCount(1);
    await expect(pop).toContainText("Eve his wife");
    await page.mouse.move(5, 5);
    await expect(pop).toHaveCount(0);
    await openLine(unpinned);
    await expect(link).toBeVisible();
    // Its new target is typed in the numbering of the user's compilation, in the search widget's
    // field: the passages it finds are listed under it, and picking one puts it in the field.
    await expect(link).toContainText(/in the numbering of MINE \(your wording\)\. Leave it empty/i);
    // The note's help says where the note is used; Escape closes the help, not the modal.
    await link.getByRole("button", { name: "About the note" }).hover();
    await expect(link.getByRole("tooltip")).toContainText(
      "The note is used when the link is printed, in the margin notes or the footnotes",
    );
    await page.screenshot(shot("annotations-note-help"));
    await page.keyboard.press("Escape");
    await expect(link.getByRole("tooltip")).toBeHidden();
    await expect(link).toBeVisible();
    await link.getByRole("textbox", { name: "Note" }).fill("Seth's line");
    const target = link.getByRole("combobox", { name: "Change where it links to" });
    await target.fill("Gen 5:2");
    const found = link.getByRole("option", { name: /^Genesis 5:2/ });
    await expect(found).toBeVisible();
    await page.screenshot(shot("annotations-link-suggestions"));
    await found.click();
    await expect(target).toHaveValue("Genesis 5:2");
    await expect(link.getByRole("option")).toHaveCount(0);
    // Escape with the suggestions open closes them, not the modal.
    await target.fill("Gen 5:2");
    await expect(found).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(found).toBeHidden();
    await expect(link).toBeVisible();
    // Words are matched in every translation, and the verses shown in this wording's: the WEB's
    // "overcome" finds John 1:5, shown in the KJV's words ("comprehended it not").
    await target.fill("darkness hasn't overcome it");
    const john = link.getByRole("option", { name: /^John 1:5/ });
    await expect(john).toContainText("comprehended it not", { timeout: 20_000 });
    await expect(john).toContainText("KJV");
    await page.screenshot(shot("annotations-link-words"));
    await john.click();
    await expect(target).toHaveValue("John 1:5");
    await target.fill("Gen 5:2");
    await expect(found).toBeVisible();
    await found.click();
    await link.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await expect(rows.filter({ hasText: "Genesis 4:25" })).toHaveText(
      /Genesis 4:25 → Genesis 5:2 Seth's line/,
    );
    // A run of verses picked is saved as picked; one typed and not picked is saved as typed.
    await openLine(rows.filter({ hasText: "Genesis 4:25" }));
    await target.fill("Gen 5:3-4");
    await link.getByRole("option", { name: /^Genesis 5:3.4/ }).click();
    await expect(target).toHaveValue(/^Genesis 5:3.4$/);
    await link.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await expect(rows.filter({ hasText: "Genesis 4:25" })).toHaveText(/→ Genesis 5:3.4/);
    await openLine(rows.filter({ hasText: "Genesis 4:25" }));
    await target.fill("Gen 5:3-5");
    await link.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await expect(rows.filter({ hasText: "Genesis 4:25" })).toHaveText(/→ Genesis 5:3.5/);

    // Its abbreviation opens its translation: its verse where it's read, nothing marked; words
    // chosen in another wording, Move pins it to them.
    await unpinned.locator("button.annotation-wording").click();
    await expect(
      translation.getByRole("region", { name: /^In Mine \(your wording\), not pinned to words/ }),
    ).toContainText("Seth");
    await expect.poll(() => painted(page, "annotation-current")).toEqual([]);
    await translation.getByRole("combobox", { name: "Move or copy to" }).selectOption({
      label: "KJV",
    });
    await expect(translation).toContainText(
      "Choose the words it's on. Copy pins a copy to them and keeps this link as it is; Move pins this one.",
    );
    await page.screenshot(shot("annotations-pin-link"));
    await translation.getByRole("button", { name: "Move", exact: true }).click();
    const kjv = translation.getByRole("region", { name: "KJV" });
    await expect(kjv).toContainText("Seth");
    await selectWord(kjv, "Seth");
    await translation.getByRole("button", { name: "Move to these words" }).click();
    await expect(page.getByRole("status")).toHaveText("Moved.");
    await expect(unpinned.locator(".annotation-line")).toHaveText(
      /^Genesis 4:25 “Seth” → Genesis 5:3.5/,
    );
    await expect(unpinned.locator("button.annotation-wording")).toHaveText("KJV");
  });

  test("vision §3.7.2: an annotation dragged onto a collection is copied or linked there, as chosen", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await create(page, "Dragged", "Mine");
    await makeNotes(page, ["Pocket", "Study"]);
    await page.goto("/annotations");
    await settled(page);
    const def = box(page, "Default collection");
    const pocket = box(page, "Pocket");
    const study = box(page, "Study");
    await head(def).click();
    await expect(def.locator("li.annotation-row")).toHaveCount(2);
    const handleIn = (b: Locator) =>
      b.getByRole("button", { name: "Copy, link or move Genesis 4:1 “Eve”" });

    // Carried, every collection shows only its heading; dropped on one, the user chooses.
    await dragTo(page, handleIn(def), head(study), async () => {
      await expect(page.locator(".annotation-box-body")).toHaveCount(0);
      await expect(page.locator(".annotation-ghost")).toHaveText("Genesis 4:1 “Eve”");
    });
    // From the default collection (what's in no other), it can't be linked: copied or moved.
    const moveInto = page.getByRole("dialog", { name: "Copy or move into “Study”?" });
    await expect(moveInto).toContainText("Change it there and the original stays as it is.");
    await expect(moveInto).toContainText(
      "The same annotation, taken out of “Default collection” and put in “Study”.",
    );
    await expect(moveInto.getByRole("button", { name: "Link" })).toHaveCount(0);
    await moveInto.getByRole("button", { name: "Move" }).click();
    await expect(page.getByRole("status")).toHaveText("Moved.");
    await expect(head(study)).toHaveAccessibleName("Study (1 item)");
    await expect(head(def)).toHaveAccessibleName("Default collection (1 item)");
    // The boxes open before the drag are open again.
    await expect(def.locator("li.annotation-row")).toHaveCount(1);

    // From Study onto Pocket, copied: one of its own there.
    await head(study).click();
    await dragTo(page, handleIn(study), head(pocket));
    const choose = page.getByRole("dialog", { name: "Copy, link or move into “Pocket”?" });
    await expect(choose).toContainText("A change to it shows in every collection it's in.");
    await expect(choose).toContainText(
      "The same annotation, taken out of “Study” and put in “Pocket”.",
    );
    await page.screenshot(shot("annotations-copy-or-link"));
    await choose.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByRole("status")).toHaveText("Copied.");
    await expect(head(pocket)).toHaveAccessibleName("Pocket (1 item)");
    await expect(head(study)).toHaveAccessibleName("Study (1 item)");

    // Onto the default one: a copy, or moved there (out of its only collection), never linked.
    // Escape is no answer.
    await dragTo(page, handleIn(study), head(def));
    const intoDefault = page.getByRole("dialog", {
      name: "Copy or move into “Default collection”?",
    });
    await expect(intoDefault.getByRole("button", { name: "Move" })).toBeVisible();
    await expect(intoDefault.getByRole("button", { name: "Link" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(intoDefault).toBeHidden();
    // Onto the collection it's in already: only a copy.
    await dragTo(page, handleIn(study), head(study));
    const again = page.getByRole("dialog", { name: "Copy into “Study”?" });
    await expect(again).toContainText("It's in “Study” already");
    await expect(again.getByRole("button", { name: "Move" })).toHaveCount(0);
    await again.getByRole("button", { name: "Cancel" }).click();
    await expect(head(def)).toHaveAccessibleName("Default collection (1 item)");
    await expect(head(study)).toHaveAccessibleName("Study (1 item)");

    // Escape while dragging puts it down: nothing is asked.
    const handle = handleIn(study);
    const at = await handle.boundingBox();
    if (!at) throw new Error("No handle.");
    await page.mouse.move(at.x + 5, at.y + 5);
    await page.mouse.down();
    await page.mouse.move(at.x + 40, at.y + 40, { steps: 4 });
    await expect(page.locator(".annotation-box-body")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(study.locator("li.annotation-row")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Without dragging: the handle pressed (here from the keyboard), then a collection chosen.
    await def.getByRole("button", { name: "Copy, link or move Genesis 4:25" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Choose the collection to copy, link or move Genesis 4:25"),
    ).toBeVisible();
    await expect(page.locator(".annotation-box-body")).toHaveCount(0);
    await head(pocket).click();
    await page
      .getByRole("dialog", { name: "Copy or move into “Pocket”?" })
      .getByRole("button", { name: "Move" })
      .click();
    await expect(page.getByRole("status")).toHaveText("Moved.");
    await expect(head(pocket)).toHaveAccessibleName("Pocket (2 items)");

    // Opened from a collection, taken out of it; and deleted.
    await head(pocket).click();
    const dialog = page.getByRole("dialog", { name: "Link" });
    await openLine(pocket.locator("li.annotation-row").filter({ hasText: "Genesis 4:25" }));
    await dialog.getByRole("button", { name: "Remove from “Pocket”" }).click();
    await expect(page.getByRole("status")).toHaveText("Removed from “Pocket”.");
    await expect(head(pocket)).toHaveAccessibleName("Pocket (1 item)");
    await expect(pocket.locator("li.annotation-row")).toHaveCount(1);
    // Its trash icon asks first, naming it: Cancel keeps it, Delete deletes it.
    const trash = pocket.getByRole("button", { name: "Delete Genesis 4:1 “Eve”" });
    const sure = page.getByRole("alertdialog", { name: "Delete the annotation?" });
    await trash.click();
    await expect(sure).toContainText(
      "Delete the annotation on Genesis 4:1 “Eve”? It isn't in any other collection.",
    );
    await page.screenshot(shot("annotations-delete"));
    await sure.getByRole("button", { name: "Cancel" }).click();
    await expect(sure).toBeHidden();
    await expect(head(pocket)).toHaveAccessibleName("Pocket (1 item)");
    await trash.click();
    await sure.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText("Deleted.");
    await expect(head(pocket)).toHaveAccessibleName("Pocket (0 items)");

    // In two collections, its trash icon takes it out of the one it's pressed in, and asks
    // nothing: it stays in the other. Pressed in its last collection, it asks, and deletes it.
    await study.getByRole("button", { name: "Copy, link or move Genesis 4:1 “Eve”" }).focus();
    await page.keyboard.press("Enter");
    await head(pocket).click();
    await page
      .getByRole("dialog", { name: "Copy, link or move into “Pocket”?" })
      .getByRole("button", { name: "Link" })
      .click();
    await expect(page.getByRole("status")).toHaveText("Linked.");
    await expect(head(pocket)).toHaveAccessibleName("Pocket (1 item)");
    await pocket.getByRole("button", { name: "Remove Genesis 4:1 “Eve” from “Pocket”" }).click();
    await expect(page.getByRole("status")).toHaveText("Removed from “Pocket”.");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(head(pocket)).toHaveAccessibleName("Pocket (0 items)");
    await expect(head(study)).toHaveAccessibleName("Study (1 item)");
    await study.getByRole("button", { name: "Delete Genesis 4:1 “Eve”" }).click();
    await sure.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText("Deleted.");
    await expect(head(study)).toHaveAccessibleName("Study (0 items)");

    // Moved from one collection into another, it's out of the first.
    await def.getByRole("button", { name: "Copy, link or move Genesis 4:25" }).focus();
    await page.keyboard.press("Enter");
    await head(study).click();
    await page
      .getByRole("dialog", { name: "Copy or move into “Study”?" })
      .getByRole("button", { name: "Move" })
      .click();
    await expect(page.getByRole("status")).toHaveText("Moved.");
    await expect(head(def)).toHaveAccessibleName("Default collection (0 items)");
    await expect(head(study)).toHaveAccessibleName("Study (1 item)");
    await dragTo(
      page,
      study.getByRole("button", { name: "Copy, link or move Genesis 4:25" }),
      head(pocket),
    );
    await page
      .getByRole("dialog", { name: "Copy, link or move into “Pocket”?" })
      .getByRole("button", { name: "Move" })
      .click();
    await expect(page.getByRole("status")).toHaveText("Moved.");
    await expect(head(study)).toHaveAccessibleName("Study (0 items)");
    await expect(head(pocket)).toHaveAccessibleName("Pocket (1 item)");

    // A collection is renamed in its box; deleted (once confirmed), what was only in it goes back
    // to the default collection.
    await pocket.getByRole("button", { name: "Rename" }).click();
    await pocket.getByRole("textbox", { name: "Title" }).fill("Pocket Bible");
    await pocket.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    const renamed = box(page, "Pocket Bible");
    await expect(head(renamed)).toHaveAccessibleName("Pocket Bible (1 item)");
    await renamed.getByRole("button", { name: "Delete collection" }).click();
    const gone = page.getByRole("alertdialog", { name: "Delete the collection?" });
    await expect(gone).toContainText("Delete the collection “Pocket Bible”?");
    await gone.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText("Deleted.");
    await expect(renamed).toHaveCount(0);
    await expect(head(def)).toHaveAccessibleName("Default collection (1 item)");
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "A touch screen.");

  test("vision §3.7.2: an annotation is dragged with a finger onto a collection", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await create(page, "Touched", "Mine");
    await makeNotes(page, ["Study", "Pocket"]);
    await page.goto("/annotations");
    await settled(page);
    const def = box(page, "Default collection");
    const study = box(page, "Study");
    await head(def).click();
    const handle = def.getByRole("button", { name: "Copy, link or move Genesis 4:1 “Eve”" });
    await expect(handle).toBeVisible();
    const a = await handle.boundingBox();
    if (!a) throw new Error("Nothing to drag.");
    // A finger on the handle, moved onto Study (the page doesn't scroll instead), and lifted.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    const x0 = a.x + a.width / 2;
    const y0 = a.y + a.height / 2;
    await touch("touchStart", x0, y0);
    for (let i = 1; i <= 4; i++) await touch("touchMove", x0 + i * 5, y0 + i * 5);
    await expect(page.locator(".annotation-box-body")).toHaveCount(0);
    // The heading has moved up, the boxes having closed.
    const now = await head(study).boundingBox();
    if (!now) throw new Error("No heading.");
    const x1 = now.x + 40;
    const y1 = now.y + now.height / 2;
    for (let i = 1; i <= 6; i++)
      await touch("touchMove", x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6);
    await touch("touchEnd", x1, y1);
    const prompt = page.getByRole("dialog", { name: "Copy or move into “Study”?" });
    await expect(prompt).toBeVisible();
    // Chrome doesn't take a tap that comes within about 300 ms of the finger lifting (a person
    // reads the prompt first).
    await page.waitForTimeout(400);
    await prompt.getByRole("button", { name: "Move" }).tap();
    await expect(page.getByRole("status")).toHaveText("Moved.");
    await expect(head(study)).toHaveAccessibleName("Study (1 item)");
    // Its editor fits the phone's screen.
    await head(study).tap();
    await openLine(study, "tap");
    const editor = page.getByRole("dialog", { name: "Annotation" });
    await expect(editor.getByRole("textbox", { name: "Text" })).toBeVisible();
    await page.screenshot(shot("annotations-edit-phone"));
    await editor.getByRole("button", { name: "Close" }).tap();
    await expect(editor).toBeHidden();
    // The prompt's three choices (its handle tapped, then another collection) fit the screen.
    await study.getByRole("button", { name: "Copy, link or move Genesis 4:1 “Eve”" }).tap();
    await head(box(page, "Pocket")).tap();
    const three = page.getByRole("dialog", { name: "Copy, link or move into “Pocket”?" });
    await expect(three.getByRole("button", { name: "Move" })).toBeVisible();
    await page.screenshot(shot("annotations-copy-or-link-phone"));
    await three.getByRole("button", { name: "Cancel" }).tap();
    await expect(three).toBeHidden();
    // The new annotation's form fits it too (an open collection's Add).
    await study.getByRole("button", { name: "Add an annotation to Study" }).tap();
    const adding = page.getByRole("dialog", { name: "New annotation" });
    await adding.getByRole("textbox", { name: "Verse or passage", exact: true }).fill("Gen 4:1");
    await adding.getByRole("button", { name: "Show" }).tap();
    await expect(adding.getByRole("region", { name: /^Genesis 4:1/ })).toContainText("Eve");
    await page.screenshot(shot("annotations-add-phone"));
    await adding.getByRole("button", { name: "Cancel" }).tap();
    await expect(adding).toBeHidden();
    // So does the new collection's.
    await page.getByRole("button", { name: "New collection" }).tap();
    const making = page.getByRole("dialog", { name: "New collection" });
    await expect(making.getByRole("textbox", { name: /^Description/ })).toBeVisible();
    await page.screenshot(shot("annotations-new-collection-phone"));
    await making.getByRole("button", { name: "Close" }).tap();
    await expect(making).toBeHidden();
    // A link's modal: a tapped passage shows its tooltip there, and the new target's suggestions
    // and the note's help fit the screen.
    await openLine(def.locator("li.annotation-row").filter({ hasText: "Genesis 4:25" }), "tap");
    const link = page.getByRole("dialog", { name: "Link" });
    await link.locator("a.st-ref", { hasText: "Genesis 5:1" }).tap();
    const pop = page.getByRole("dialog", { name: "Scripture passage" });
    await expect(pop).toContainText("This is the book of the generations of Adam");
    await pop.getByRole("combobox", { name: "Translation" }).selectOption("eng-web");
    await expect(pop.getByRole("combobox", { name: "Translation" })).toHaveValue("eng-web");
    await page.screenshot(shot("annotations-link-tooltip-phone"));
    await link.getByRole("button", { name: "About the note" }).tap();
    await expect(link.getByRole("tooltip")).toBeVisible();
    await expect(pop).toBeHidden();
    await page.screenshot(shot("annotations-note-help-phone"));
    const target = link.getByRole("combobox", { name: "Change where it links to" });
    await target.fill("Gen 5:2");
    await expect(link.getByRole("option", { name: /^Genesis 5:2/ })).toBeVisible();
    await page.screenshot(shot("annotations-link-suggestions-phone"));
    await link.getByRole("option", { name: /^Genesis 5:2/ }).tap();
    await expect(target).toHaveValue("Genesis 5:2");
  });
});
