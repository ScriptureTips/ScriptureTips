import {
  addressTranslation,
  DEFAULT_TRANSLATION,
  destinationUrl,
  type ReferenceMatch,
  SCRIPTURETIPS,
} from "@scripturetips/scripture-links";
import { type LinkFormat, outsideSite, type Settings, siteOf } from "./settings.ts";

/** What the extension's own pages share. */

export const FORMAT_NAMES: Record<LinkFormat, string> = {
  html: "HTML",
  bbcode: "BBCode (forums)",
  wiki: "Wiki markup",
  markdown: "Markdown",
};

/** The element with this ID, which the page is known to have. */
export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no #${id}.`);
  return el as T;
}

/** Fills a select with options, choosing `value`. */
export function fill(
  select: HTMLSelectElement,
  options: readonly { value: string; label: string }[],
  value: string,
): void {
  select.replaceChildren(
    ...options.map((o) => {
      const option = document.createElement("option");
      option.value = o.value;
      option.textContent = o.label;
      return option;
    }),
  );
  select.value = value;
}

/** The places links can go: the ScriptureTips reader, then each outside site by its place. */
export const destinations = (settings: Settings) => [
  { value: SCRIPTURETIPS, label: "ScriptureTips" },
  ...settings.outsideSites.map((s, i) => ({ value: String(i), label: s.name || s.url })),
];

/** A destination's value in a select back to the setting. */
export const destinationOf = (value: string): Settings["destination"] =>
  value === SCRIPTURETIPS ? SCRIPTURETIPS : Number(value);

/** Where a reference's link goes, for the link generator. */
export function addressFor(
  settings: Settings,
  destination: Settings["destination"],
): (ref: ReferenceMatch) => string {
  const outside = outsideSite({ ...settings, destination }) ?? undefined;
  const template = outside ? outside.url : SCRIPTURETIPS;
  const translation = addressTranslation(
    template,
    outside?.translation || undefined,
    settings.translation ?? DEFAULT_TRANSLATION,
  );
  return (ref) => destinationUrl(template, siteOf(settings), translation, ref);
}
