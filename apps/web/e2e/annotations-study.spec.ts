import { expect as baseExpect, type Locator, type Page, test } from "@playwright/test";
import {
  arriveFromOwnAddress,
  openNewCompilation,
  rememberStudyWindow,
  shot,
  signUp,
} from "./support.ts";

arriveFromOwnAddress();

// The desktop layout: study mode's tooltip with a mouse (the annotations page has its own spec).
test.skip(({ isMobile }) => isMobile, "The desktop layout.");

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

async function dragAcross(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Nothing to select.");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, y, { steps: 6 });
  await page.mouse.up();
}

/** "Eve" in the compilation's own wording of Genesis 4:1 (KJV: "And Adam knew Eve his wife"). */
const EVE = {
  in: "@compilation",
  compilation: "mine",
  start: { verse: "Gen.4.1", offset: 14 },
  end: { verse: "Gen.4.1", offset: 17 },
};

/** Makes an annotation and a link through the API, as study mode would. */
async function makeNotes(page: Page) {
  await page.evaluate(async (anchor) => {
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
      anchor,
    });
    await post("/api/links", { compilation: "mine", source: "Gen.4.25", target: "Gen 5:1" });
  }, EVE);
}

/** The words the study highlights are drawn on now, with the wording each is in. */
const highlighted = (page: Page) =>
  page.evaluate(() =>
    [...(CSS.highlights.get("study-link") ?? [])].map((r) => {
      const range = r as Range;
      const node = range.startContainer;
      const el = node instanceof Element ? node : node.parentElement;
      return {
        text: range.toString(),
        in: el?.closest(".verse-unit")?.getAttribute("data-words-in") ?? "",
        own: el?.closest("td.compare-own") !== null,
      };
    }),
  );

test("domain-model §3.4: selected words are annotated in study mode, with a mark, a list and a highlight", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await create(page, "Annotated", "Mine");
  await rememberStudyWindow(page);
  await page.goto("/compilations/mine?book=Gen&chapter=4&mode=compare&study=1");
  await settled(page);
  const own = page.locator("td.compare-own").first();
  const eve = own.locator('.study-word[data-strong="H2332"]').first();
  const tip = page.getByRole("dialog", { name: "The selected words" });
  await dragAcross(page, eve);
  await tip.getByRole("button", { name: "Annotate", exact: true }).click();
  const field = tip.getByRole("textbox", { name: "Your annotation on these words" });
  await expect(field).toBeFocused();
  // Typing keeps the tooltip and the words.
  await field.fill("The mother of all living");
  await page.screenshot(shot("annotate-form"));
  await tip.getByRole("button", { name: "Save", exact: true }).click();
  await expect(tip.getByRole("list", { name: "Annotations" })).toContainText(
    "The mother of all living",
  );
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);

  // Pinned to the compilation's wording, like a link made there.
  const anchors = await page.evaluate(async () => {
    const res = await fetch("/api/annotations?ref=Gen.4.1");
    const body = (await res.json()) as { annotations: { anchor: { in: string } | null }[] };
    return body.annotations.map((a) => a.anchor?.in);
  });
  expect(anchors).toEqual(["@compilation"]);

  // A lettered mark in the compilation's column, its tip quoting the words and the text.
  const mark = page.locator(".user-note-mark").filter({ visible: true });
  await expect(mark).toHaveCount(1);
  await mark.hover();
  await expect(mark.locator(".note-tip")).toContainText("“Eve” The mother of all living");
  await page.mouse.move(5, 5);
  // Listed under the table with your notes.
  await expect(page.getByRole("region", { name: "Your notes" })).toContainText(
    "The mother of all living",
  );
  // The words are drawn, in the compilation's column.
  await expect
    .poll(() => highlighted(page))
    .toContainEqual({
      text: "Eve",
      in: "eng-kjv",
      own: true,
    });

  // Clicking them opens the tooltip with the annotation, which can be removed there.
  await eve.click();
  await expect(tip.getByRole("list", { name: "Annotations" })).toContainText(
    "The mother of all living",
  );
  await tip.getByRole("button", { name: "Remove the annotation" }).click();
  await expect(tip.getByRole("list", { name: "Annotations" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".user-note-mark").filter({ visible: true })).toHaveCount(0);
});

test("domain-model §3.6: an annotation copied to another translation is pinned to the words chosen there, and drawn on them", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await create(page, "Copied", "Mine");
  await makeNotes(page);
  // Copied on the annotations page, from its abbreviation, onto the ASV's "Eve".
  await page.goto("/annotations");
  await settled(page);
  const def = page
    .locator("section.annotation-box")
    .filter({ has: page.getByRole("heading", { name: /^Default collection \(/ }) });
  await def.getByRole("heading").getByRole("button").click();
  await expect(def.locator("li.annotation-row")).toHaveCount(2);
  await def.getByRole("button", { name: /^Mine: .*Genesis 4:1/i }).click();
  const translation = page.getByRole("dialog", { name: "Translation" });
  await translation
    .getByRole("combobox", { name: "Move or copy to" })
    .selectOption({ label: "ASV" });
  await translation.getByRole("button", { name: "Copy", exact: true }).click();
  const picker = translation.getByRole("region", { name: "ASV" });
  await expect(picker).toContainText("Eve");
  // The words chosen in the ASV's wording.
  await picker.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest(".verse-words")) continue;
      const at = node.textContent?.indexOf("Eve") ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 3);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      return;
    }
    throw new Error("No Eve.");
  });
  await translation.getByRole("button", { name: "Copy to these words" }).click();
  await expect(page.getByRole("status")).toHaveText("Copied.");
  await expect(def.locator("li.annotation-row")).toHaveCount(3);
  await expect(def.getByRole("button", { name: /^ASV: .*Genesis 4:1/ })).toHaveCount(1);

  // In the compare view, with the ASV as a column, the copy is drawn on the ASV's "Eve".
  await rememberStudyWindow(page);
  await page.goto("/compilations/mine?book=Gen&chapter=4&mode=compare&study=1");
  await settled(page);
  const asv = await page.evaluate(async () => {
    const res = await fetch("/api/collections/items");
    const body = (await res.json()) as { items: { anchor: { in: string } | null }[] };
    return body.items.map((i) => i.anchor?.in).find((w) => w && w !== "@compilation") ?? "";
  });
  await expect(page.locator(`td .verse-unit[data-words-in="${asv}"]`).first()).toBeVisible();
  await expect.poll(() => highlighted(page)).toContainEqual({ text: "Eve", in: asv, own: false });
  // And its mark is at the end of the ASV's verse.
  await expect(
    page
      .locator(`td:not(.compare-own) .verse-unit[data-words-in="${asv}"] .user-note-mark`)
      .filter({ visible: true }),
  ).toHaveCount(1);
});

test("domain-model §3.6: the study window's footer shows each collection on its own; an item in two shows while either is ticked", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await create(page, "Layered", "Mine");
  // "Eve" (4:1) in two collections, "Abel" (4:2) in none: the default collection.
  await page.evaluate(async (eve) => {
    const send = async (url: string, method: string, body: object) => {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as { id: string };
    };
    const pocket = await send("/api/collections", "POST", { title: "Pocket" });
    const study = await send("/api/collections", "POST", { title: "Study" });
    await send("/api/annotations", "POST", {
      compilation: "mine",
      source: "Gen.4.1",
      body: "The mother of all living",
      quote: "Eve",
      anchor: eve,
      collections: [pocket.id, study.id],
    });
    await send("/api/annotations", "POST", {
      compilation: "mine",
      source: "Gen.4.2",
      body: "A keeper of sheep",
      quote: "Abel",
      anchor: {
        ...eve,
        start: { verse: "Gen.4.2", offset: 31 },
        end: { verse: "Gen.4.2", offset: 35 },
      },
    });
  }, EVE);
  await rememberStudyWindow(page);
  await page.goto("/compilations/mine?book=Gen&chapter=4&mode=compare&study=1");
  await settled(page);
  const study = page.getByRole("dialog", { name: "Study" });
  const expand = study.getByRole("button", { name: "Expand the study window" });
  if (await expand.isVisible()) await expand.click();
  await expect(study).not.toHaveClass(/moving/);

  const marks = page.locator(".user-note-mark").filter({ visible: true });
  const yours = page.getByRole("region", { name: "Your notes" });
  const drawn = async () => (await highlighted(page)).map((h) => h.text).sort();
  await expect.poll(drawn).toEqual(["Abel", "Eve"]);
  await expect(marks).toHaveCount(2);
  // Listed under each collection it's in.
  await expect(yours.getByRole("heading", { name: "Pocket" })).toBeVisible();
  await expect(yours.getByRole("heading", { name: "Study" })).toBeVisible();
  await expect(yours.getByRole("heading", { name: "Default collection" })).toBeVisible();
  await expect(
    yours.getByRole("listitem").filter({ hasText: "The mother of all living" }),
  ).toHaveCount(2);

  // The footer lists the collections: the default one first.
  await study.getByText("Your notes", { exact: true }).hover();
  const tip = page.locator(".layer-tip").filter({ hasText: "Default collection" });
  await expect(tip.getByRole("checkbox")).toHaveCount(3);
  await expect(tip.getByRole("listitem")).toHaveText(["Default collection", "Pocket", "Study"]);
  await page.screenshot(shot("study-footer-collections"));

  // Study off: Eve is still in Pocket, so stays (listed once now).
  await tip.getByRole("checkbox", { name: "Study" }).uncheck();
  await expect(yours.getByRole("heading", { name: "Study" })).toHaveCount(0);
  await expect(
    yours.getByRole("listitem").filter({ hasText: "The mother of all living" }),
  ).toHaveCount(1);
  await expect.poll(drawn).toEqual(["Abel", "Eve"]);
  // Pocket off too: Eve goes (mark, list and highlight); Abel, in the default collection, stays.
  await tip.getByRole("checkbox", { name: "Pocket" }).uncheck();
  await expect.poll(drawn).toEqual(["Abel"]);
  await expect(marks).toHaveCount(1);
  await expect(yours).not.toContainText("The mother of all living");
  await expect(yours).toContainText("A keeper of sheep");

  // With Your notes off, ticking one collection turns it on for that one alone.
  await page.mouse.move(5, 5);
  await study.getByRole("checkbox", { name: "Your notes" }).uncheck();
  await expect(marks).toHaveCount(0);
  await expect.poll(drawn).toEqual([]);
  await study.getByText("Your notes", { exact: true }).hover();
  await tip.getByRole("checkbox", { name: "Study" }).check();
  await expect(study.getByRole("checkbox", { name: "Your notes" })).toBeChecked();
  await expect(tip.getByRole("checkbox", { name: "Default collection" })).not.toBeChecked();
  await expect(tip.getByRole("checkbox", { name: "Pocket" })).not.toBeChecked();
  await expect.poll(drawn).toEqual(["Eve"]);
  await expect(marks).toHaveCount(1);
  await expect(yours).not.toContainText("A keeper of sheep");
});
