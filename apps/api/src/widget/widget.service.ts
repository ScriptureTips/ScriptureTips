import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, translation } from "@scripturetips/db";
import { attributionFor, licenseFor } from "@scripturetips/licenses";
import { bookByOsis, parseOsisPassage, toOrdinalRange } from "@scripturetips/passage";
import { english, formatPassage } from "@scripturetips/reference";
import {
  passageFromCanonical,
  passageToCanonical,
  type SchemeId,
} from "@scripturetips/versification";
import { editableText, type Inline } from "../compilations/wording.ts";
import { DATABASE, type Database } from "../database.ts";
import { TranslationsService } from "../translations/translations.service.ts";

/** The most verses one tooltip shows; a longer passage says there's more. */
export const MAX_WIDGET_VERSES = 12;
/** The most verses a whole chapter shows in the widget's reader (Psalm 119 has 176). */
export const MAX_CHAPTER_VERSES = 200;

/** A book a translation has, for the widget reader's book list. */
export interface WidgetBook {
  readonly osis: string;
  /** The book's name ("1 Corinthians"). */
  readonly name: string;
  /** Its chapters, in the translation's numbering. */
  readonly chapters: readonly number[];
  /** Where the book is listed: the Old Testament, the New Testament, or other writings. */
  readonly section: "ot" | "nt" | "other";
}

export interface WidgetTranslation {
  readonly id: string;
  readonly abbreviation: string;
  readonly name: string;
  readonly language: string;
  readonly direction: "ltr" | "rtl";
}

/** A translator's note on a verse: the mark's place in `text` (a character offset), and its words. */
export interface WidgetNote {
  readonly at: number;
  /** The mark: the source's own caller, or a, b, c … through the passage. */
  readonly letter: string;
  readonly text: string;
}

export interface WidgetVerse {
  readonly number: string;
  readonly text: string;
  /** In reading order; left out when the verse has none. Older readers ignore it. */
  readonly notes?: readonly WidgetNote[];
}

export interface WidgetPassage {
  readonly translation: WidgetTranslation;
  /** The passage as it reads in this translation's numbering ("Psalm 51:3–5"). */
  readonly label: string;
  readonly verses: readonly WidgetVerse[];
  /** The passage goes on past the verses shown. */
  readonly more: boolean;
  /** What the license asks to be shown with the text (licenses.md), or null. */
  readonly attribution: {
    readonly designation: string;
    readonly statement: string;
    readonly links: readonly { readonly text: string; readonly url: string }[];
  } | null;
}

/** a, b … z, aa, ab …: note letters, as printed Bibles letter them. */
const letter = (n: number): string =>
  n < 26
    ? String.fromCharCode(97 + n)
    : letter(Math.floor(n / 26) - 1) + String.fromCharCode(97 + (n % 26));

// Stand-ins for a note's place while the text is tidied (private-use characters).
const MARK_OPEN = "\uE000";
const MARK_CLOSE = "\uE001";

/** A note's words: its text, without its own reference (`fr`, "23.2"). */
function noteText(body: readonly Inline[]): string {
  const words = (nodes: readonly Inline[]): string =>
    nodes
      .map((n) =>
        typeof n === "string"
          ? n
          : n.type === "char" && n.marker === "fr"
            ? ""
            : n.type === "char" || n.type === "span"
              ? words(n.content)
              : "",
      )
      .join("");
  return words(body).replace(/\s+/g, " ").trim();
}

/** The verse's words, tidied as for reading in a tooltip, and where its notes' marks fall in them. */
function shownVerse(
  content: readonly Inline[],
  notes: readonly { position: number; caller: string; body: Inline[] }[],
  lettered: { count: number },
): { text: string; notes: WidgetNote[] } {
  const byPosition = new Map(notes.map((n) => [n.position, n]));
  const marked = (nodes: readonly Inline[]): string =>
    nodes
      .map((n) =>
        typeof n === "string"
          ? n
          : n.type === "char" || n.type === "span"
            ? marked(n.content)
            : n.type === "note"
              ? `${MARK_OPEN}${n.position}${MARK_CLOSE}`
              : "",
      )
      .join("");
  const tidy = marked(content).replace(/¶\s*/g, "").replace(/\s+/g, " ").trim();
  let text = "";
  const found: WidgetNote[] = [];
  let last = 0;
  for (const m of tidy.matchAll(new RegExp(`${MARK_OPEN}(\\d+)${MARK_CLOSE}`, "g"))) {
    text += tidy.slice(last, m.index);
    last = m.index + m[0].length;
    const note = byPosition.get(Number(m[1]));
    const words = note ? noteText(note.body) : "";
    if (!note || words === "") continue;
    const mark = note.caller !== "+" && note.caller !== "-" ? note.caller : letter(lettered.count);
    lettered.count += 1;
    found.push({ at: text.length, letter: mark, text: words });
  }
  text += tidy.slice(last);
  return { text, notes: found };
}

/**
 * What website plugins and the browser extension read (vision §3.6): the translations they may
 * show, and a passage's words. A page's references are read in the KJV's numbering unless it says
 * otherwise, so a passage is given by its OSIS reference and the scheme that numbers it, made
 * canonical here, and read out of the translation in that translation's own numbering.
 */
@Injectable()
export class WidgetService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TranslationsService) private readonly translations: TranslationsService,
  ) {}

  /** The translations that can be shown on other sites: those whose license is on record. */
  async list(): Promise<WidgetTranslation[]> {
    const rows = await this.translations.list();
    const keys = await this.db
      .select({ id: translation.catalogId, license: translation.licenseKey })
      .from(translation)
      .orderBy(asc(translation.name));
    const known = new Set(keys.filter((k) => licenseFor(k.license)).map((k) => k.id));
    return rows
      .filter((t) => known.has(t.id))
      .map(({ id, abbreviation, name, language, direction }) => ({
        id,
        abbreviation,
        name,
        language,
        direction,
      }));
  }

  async passage(input: {
    translation: string;
    reference: string;
    scheme: SchemeId | "own";
    /** The most verses to give; a tooltip's 12 if left out. */
    max?: number;
  }): Promise<WidgetPassage> {
    const max = input.max ?? MAX_WIDGET_VERSES;
    const [row] = await this.db
      .select()
      .from(translation)
      .where(eq(translation.catalogId, input.translation));
    // A translation whose terms aren't on record isn't shown, as in the list.
    if (!row || !licenseFor(row.licenseKey))
      throw new NotFoundException({ code: "unknown-translation" });

    let entered: ReturnType<typeof parseOsisPassage>;
    try {
      entered = parseOsisPassage(input.reference);
    } catch {
      throw new BadRequestException({ code: "bad-passage" });
    }
    const canonical = passageToCanonical(
      input.scheme === "own" ? (row.scheme as SchemeId) : input.scheme,
      entered,
    );
    if (!canonical) throw new NotFoundException({ code: "not-in-canon" });

    const found = await this.translations.versesOverlapping(
      row.id,
      toOrdinalRange(canonical),
      max + 1,
    );
    const counts = await this.translations.verseCounts(row.id);
    const here = passageFromCanonical(row.scheme as SchemeId, canonical) ?? canonical;
    const attribution = attributionFor(row.licenseKey);
    const lettered = { count: 0 };
    return {
      translation: {
        id: row.catalogId,
        abbreviation: row.abbreviation,
        name: row.name,
        language: row.language,
        direction: row.direction as "ltr" | "rtl",
      },
      label: formatPassage(here, { verses: counts }),
      verses: found.slice(0, max).map((v): WidgetVerse => {
        const shown = shownVerse(v.content as Inline[], v.notes as never, lettered);
        return {
          // A psalm's heading is verse 0 and has no number.
          number:
            v.verse === 0 ? "" : (v.published ?? (v.to ? `${v.verse}–${v.to}` : String(v.verse))),
          text: shown.text,
          ...(shown.notes.length > 0 ? { notes: shown.notes } : {}),
        };
      }),
      more: found.length > max,
      attribution: attribution
        ? {
            designation: attribution.designation,
            statement: attribution.statement,
            links: attribution.links,
          }
        : null,
    };
  }

  /** The books a translation has text for, with their chapters, for the widget reader. */
  async books(catalogId: string): Promise<WidgetBook[]> {
    const row = await this.shown(catalogId);
    const books = await this.translations.books(row.catalogId);
    return (books ?? []).map((b) => ({
      osis: b.osis,
      name: english.name(b.osis, "full", "one"),
      chapters: b.chapters,
      section: ((g) => (g === "ot" || g === "nt" ? g : "other"))(bookByOsis(b.osis)?.group),
    }));
  }

  /** A whole chapter, in the translation's own numbering (the widget reader's page). */
  async chapter(input: {
    translation: string;
    book: string;
    chapter: number;
  }): Promise<WidgetPassage> {
    const row = await this.shown(input.translation);
    const counts = await this.translations.verseCounts(row.id);
    const verses = counts.verses(input.book, input.chapter);
    if (!verses) throw new NotFoundException({ code: "not-in-canon" });
    const first = verses.first;
    return this.passage({
      translation: input.translation,
      reference: `${input.book}.${input.chapter}.${Math.max(first, 1)}-${input.book}.${input.chapter}.${verses.last}`,
      scheme: "own",
      max: MAX_CHAPTER_VERSES,
    });
  }

  /** A translation that may be shown on other sites (its terms are on record), or 404. */
  private async shown(catalogId: string) {
    const [row] = await this.db
      .select()
      .from(translation)
      .where(eq(translation.catalogId, catalogId));
    if (!row || !licenseFor(row.licenseKey))
      throw new NotFoundException({ code: "unknown-translation" });
    return row;
  }
}
