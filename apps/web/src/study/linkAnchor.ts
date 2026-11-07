/**
 * Words a link is pinned to (domain-model §3.1). The anchor names the wording the words were
 * selected in (a translation, or the compilation's own), the verse, and where they start and end
 * as counts of characters from the start of the verse's words: the text in `.verse-words`,
 * without verse numbers, headings, note marks, designations or an idiom's brackets. The quoted
 * text goes with it, so the words can be found again, or at least shown, if the wording changes.
 */

/** Where in a verse's words a pinned selection begins or ends. */
export interface AnchorPoint {
  /** The verse's canonical verses, as `data-canonical` has them (`Gen.4.1`). */
  readonly verse: string;
  readonly offset: number;
}

/** apps/api `Anchor`. */
export interface Anchor {
  /** The translation's catalog ID, or `@compilation` for the compilation's own wording. */
  readonly in: string;
  /** The compilation the words were selected in. */
  readonly compilation: string;
  readonly start: AnchorPoint;
  readonly end: AnchorPoint;
}

/** What isn't counted: it's drawn inside `.verse-words` but isn't the verse's wording. */
const SKIPPED = ".note-mark, .designation, .idiom-mark";

const WORDS = ".verse-words";
const UNIT = ".verse-unit[data-canonical]";

/** The text nodes of a verse's words that count, in order. */
function counted(words: Element): Text[] {
  const found: Text[] = [];
  const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && !parent.closest(SKIPPED)) found.push(node as Text);
  }
  return found;
}

/** The verse's words as counted. */
const textOf = (words: Element): string =>
  counted(words)
    .map((t) => t.data)
    .join("");

/** How many counted characters come before a point in the verse's words. */
function offsetIn(words: Element, node: Node, offset: number): number {
  const before = document.createRange();
  before.setStart(words, 0);
  before.setEnd(node, offset);
  let total = 0;
  for (const text of counted(words)) {
    if (text === node) return total + offset;
    // Wholly before the point, or after it.
    if (before.comparePoint(text, text.length) <= 0) total += text.length;
    else break;
  }
  return total;
}

/** The text node and offset for a count of characters into the verse's words. */
function locate(words: Element, offset: number): { node: Text; offset: number } | null {
  let left = offset;
  let last: Text | null = null;
  for (const text of counted(words)) {
    last = text;
    if (left <= text.length) return { node: text, offset: left };
    left -= text.length;
  }
  return last ? { node: last, offset: last.length } : null;
}

const canonicalOf = (unit: Element): string => unit.getAttribute("data-canonical") ?? "";
const wordsOf = (unit: Element): Element | null => unit.querySelector(WORDS);

/** The table cell a verse is in (its column), or null where verses aren't in a table. */
const columnOf = (unit: Element): number | null => {
  const cell = unit.closest("td");
  return cell ? cell.cellIndex : null;
};

/** Whitespace as the tooltip's selected text has it. */
const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * The anchor for a selection, or null where there's no one wording to pin it to: it reaches
 * across columns' wordings, or starts and ends outside verses.
 */
export function readAnchor(scope: Element, range: Range, compilation: string): Anchor | null {
  const touched = [...scope.querySelectorAll<HTMLElement>(UNIT)].filter((u) =>
    range.intersectsNode(u),
  );
  const first = touched[0];
  const wording = first?.dataset["wordsIn"];
  if (!first || !wording) return null;
  // The column the selection starts in: a drag down a column also passes through the others.
  const column = columnOf(first);
  const units = touched.filter(
    (u) => columnOf(u) === column && u.dataset["wordsIn"] === wording && wordsOf(u),
  );
  const start = units[0];
  const end = units[units.length - 1];
  const startWords = start && wordsOf(start);
  const endWords = end && wordsOf(end);
  if (!start || !end || !startWords || !endWords) return null;

  const whole = document.createRange();
  whole.selectNodeContents(startWords);
  const begins =
    range.compareBoundaryPoints(Range.START_TO_START, whole) <= 0
      ? 0
      : startWords.contains(range.startContainer)
        ? offsetIn(startWords, range.startContainer, range.startOffset)
        : 0;
  const tail = document.createRange();
  tail.selectNodeContents(endWords);
  const finishes =
    range.compareBoundaryPoints(Range.END_TO_END, tail) >= 0
      ? textOf(endWords).length
      : endWords.contains(range.endContainer)
        ? offsetIn(endWords, range.endContainer, range.endOffset)
        : 0;
  return {
    in: wording,
    compilation,
    start: { verse: canonicalOf(start), offset: begins },
    end: { verse: canonicalOf(end), offset: finishes },
  };
}

/** The ranges an anchor covers in each column showing its wording, checked against its quote. */
export function anchorRanges(
  scope: Element,
  anchor: Anchor,
  quote: string,
  compilation: string,
): Range[] {
  const matching = [...scope.querySelectorAll<HTMLElement>(UNIT)].filter(
    (u) =>
      // The phone's list and the table are both in the page, one hidden by the screen's width.
      (wordsOf(u)?.getClientRects().length ?? 0) > 0 &&
      u.dataset["wordsIn"] === anchor.in &&
      (anchor.in !== "@compilation" || anchor.compilation === compilation),
  );
  const columns = new Map<number | null, HTMLElement[]>();
  for (const u of matching) {
    const column = columnOf(u);
    columns.set(column, [...(columns.get(column) ?? []), u]);
  }
  const ranges: Range[] = [];
  for (const units of columns.values()) {
    const from = units.findIndex((u) => canonicalOf(u) === anchor.start.verse);
    const to = units.findIndex((u, i) => i >= from && canonicalOf(u) === anchor.end.verse);
    const first = units[from];
    const last = units[to];
    if (from < 0 || to < 0 || !first || !last) continue;
    const inside = units.slice(from, to + 1).flatMap((u) => wordsOf(u) ?? []);
    const pinned = pinnedRange(inside, anchor, quote);
    if (pinned) ranges.push(pinned);
  }
  return ranges;
}

/**
 * The range from the anchor's offsets in these verses' words if it holds the quote; failing
 * that, for words within one verse, the quote's nearest place in it; otherwise none.
 */
function pinnedRange(words: Element[], anchor: Anchor, quote: string): Range | null {
  const startWords = words[0];
  const endWords = words[words.length - 1];
  if (!startWords || !endWords) return null;
  const at = (offsets: { start: number; end: number }) => {
    const a = locate(startWords, offsets.start);
    const b = locate(endWords, offsets.end);
    if (!a || !b) return null;
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    return range;
  };
  const same = startWords === endWords;
  const textBetween = (start: number, end: number) =>
    squash(
      same
        ? textOf(startWords).slice(start, end)
        : [
            textOf(startWords).slice(start),
            ...words.slice(1, -1).map(textOf),
            textOf(endWords).slice(0, end),
          ].join(" "),
    );
  const exact = { start: anchor.start.offset, end: anchor.end.offset };
  if (textBetween(exact.start, exact.end) === quote) return at(exact);
  if (!same) return null;
  // The wording moved: the quote's nearest place in the verse.
  const text = textOf(startWords);
  let best = -1;
  for (let i = text.indexOf(quote); i >= 0; i = text.indexOf(quote, i + 1))
    if (best < 0 || Math.abs(i - exact.start) < Math.abs(best - exact.start)) best = i;
  return best < 0 ? null : at({ start: best, end: best + quote.length });
}

/** The name of the highlight (styled in globals.css as `::highlight(study-link)`). */
export const LINK_HIGHLIGHT = "study-link";

/** Draws the words the user's links are pinned to; no links, or no support, clears it. */
export function paintLinks(
  scope: Element,
  compilation: string,
  links: readonly { quote: string | null; anchor: Anchor | null }[],
): void {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const ranges = links.flatMap((l) =>
    l.anchor && l.quote ? anchorRanges(scope, l.anchor, l.quote, compilation) : [],
  );
  if (ranges.length === 0) CSS.highlights.delete(LINK_HIGHLIGHT);
  else CSS.highlights.set(LINK_HIGHLIGHT, new Highlight(...ranges));
}
