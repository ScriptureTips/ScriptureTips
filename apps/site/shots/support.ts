import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { docsVersionOf } from "../src/content.ts";

/**
 * Shared steps for the help's screenshots: each is cropped to what its topic is about, with the
 * control in question ringed where that helps, at twice the screen's resolution (the site shows
 * them at half their pixel size, `SHOT_SCALE`).
 */

/** The page the products are shown on: someone else's website. */
export const DEMO = "https://blog.example/";

export const demoPage = (head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Notes from Sunday</title>
<style>
  body { margin: 0; background: #fff; color: #222; font: 18px/1.6 Georgia, serif; }
  main { width: 600px; padding: 20px 28px 16px; }
  h1 { margin: 0 0 12px; font-size: 26px; }
  p { margin: 0 0 14px; }
  textarea { display: block; width: 100%; height: 70px; margin-top: 8px; font: 15px/1.4 sans-serif; padding: 8px; }
</style>${head}</head><body>
<main>
  <h1>Notes from Sunday</h1>
  <p id="first">The sermon began with Romans 5:8, where Paul says that love came first.</p>
  <p id="second">It ended, as you might expect, with John 3:16.</p>
</main></body></html>`;

/** Where a product's current screenshots are kept: its content folder for the version it's at. */
export function imagesOf(product: string, productVersion: string): string {
  return join(
    import.meta.dirname,
    `../content/en-US/${product}/${docsVersionOf(productVersion)}/images`,
  );
}

interface Crop {
  /** What the picture must hold. */
  readonly around: readonly Locator[];
  /** The control the topic is about, ringed. */
  readonly ring?: Locator;
  /** Space kept around it all, in CSS pixels. */
  readonly pad?: number;
}

/** The development hosts the shots run against, and the public names the help must show. */
const PUBLIC_HOSTS: readonly (readonly [string, string])[] = [
  ["dev.scripturetips.com", "scripturetips.com"],
  ["dev.scripture.tips", "scripture.tips"],
];

/** Shows the public host names wherever the page displays a development one (text and fields). */
export async function showPublicHosts(page: Page): Promise<void> {
  await page.evaluate((hosts) => {
    const swap = (text: string) => hosts.reduce((t, [from, to]) => t.split(from).join(to), text);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      node.textContent = swap(node.textContent ?? "");
    }
    for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    )) {
      field.value = swap(field.value);
      field.placeholder = swap(field.placeholder);
    }
  }, PUBLIC_HOSTS);
}

/** Takes one cropped screenshot. It may be scrolled. */
export async function capture(page: Page, file: string, crop: Crop): Promise<void> {
  const pad = crop.pad ?? 14;
  await showPublicHosts(page);
  // Boxes are measured in the viewport, a full-page clip in the page: add how far it's scrolled.
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  if (crop.ring) {
    const found = await crop.ring.boundingBox();
    if (!found) throw new Error(`${file}: nothing to ring`);
    const box = { ...found, x: found.x + scroll.x, y: found.y + scroll.y };
    await page.evaluate((b) => {
      const ring = document.createElement("div");
      ring.id = "shot-ring";
      ring.style.cssText = `position:absolute;z-index:2147483647;pointer-events:none;left:${b.x - 5}px;top:${
        b.y - 5
      }px;width:${b.width + 10}px;height:${b.height + 10}px;border:3px solid #e8590c;border-radius:8px;box-shadow:0 0 0 3px rgb(232 89 12 / 0.25);box-sizing:border-box;`;
      document.documentElement.append(ring);
    }, box);
  }
  let left = Infinity;
  let top = Infinity;
  let right = 0;
  let bottom = 0;
  for (const locator of crop.around) {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${file}: something to show isn't on the page`);
    left = Math.min(left, box.x + scroll.x);
    top = Math.min(top, box.y + scroll.y);
    right = Math.max(right, box.x + scroll.x + box.width);
    bottom = Math.max(bottom, box.y + scroll.y + box.height);
  }
  const x = Math.max(0, Math.floor(left - pad));
  const y = Math.max(0, Math.floor(top - pad));
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({
    path: file,
    fullPage: true,
    clip: { x, y, width: Math.ceil(right + pad) - x, height: Math.ceil(bottom + pad) - y },
    animations: "disabled",
    caret: "hide",
  });
  await page.evaluate(() => document.getElementById("shot-ring")?.remove());
}
