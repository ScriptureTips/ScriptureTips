import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq, translation } from "@scripturetips/db";
import { attributionFor, licenseFor } from "@scripturetips/licenses";
import { parseOsisPassage, toOrdinalRange } from "@scripturetips/passage";
import { formatPassage } from "@scripturetips/reference";
import {
  passageFromCanonical,
  passageToCanonical,
  type SchemeId,
} from "@scripturetips/versification";
import { editableText } from "../compilations/wording.ts";
import { DATABASE, type Database } from "../database.ts";
import { TranslationsService } from "../translations/translations.service.ts";

/** The most verses one tooltip shows; a longer passage says there's more. */
export const MAX_WIDGET_VERSES = 12;

export interface WidgetTranslation {
  readonly id: string;
  readonly abbreviation: string;
  readonly name: string;
  readonly language: string;
  readonly direction: "ltr" | "rtl";
}

export interface WidgetPassage {
  readonly translation: WidgetTranslation;
  /** The passage as it reads in this translation's numbering ("Psalm 51:3–5"). */
  readonly label: string;
  readonly verses: readonly { readonly number: string; readonly text: string }[];
  /** The passage goes on past the verses shown. */
  readonly more: boolean;
  /** What the license asks to be shown with the text (licenses.md), or null. */
  readonly attribution: {
    readonly designation: string;
    readonly statement: string;
    readonly links: readonly { readonly text: string; readonly url: string }[];
  } | null;
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
    scheme: SchemeId;
  }): Promise<WidgetPassage> {
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
    const canonical = passageToCanonical(input.scheme, entered);
    if (!canonical) throw new NotFoundException({ code: "not-in-canon" });

    const found = await this.translations.versesOverlapping(
      row.id,
      toOrdinalRange(canonical),
      MAX_WIDGET_VERSES + 1,
    );
    const counts = await this.translations.verseCounts(row.id);
    const here = passageFromCanonical(row.scheme as SchemeId, canonical) ?? canonical;
    const attribution = attributionFor(row.licenseKey);
    return {
      translation: {
        id: row.catalogId,
        abbreviation: row.abbreviation,
        name: row.name,
        language: row.language,
        direction: row.direction as "ltr" | "rtl",
      },
      label: formatPassage(here, { verses: counts }),
      verses: found.slice(0, MAX_WIDGET_VERSES).map((v) => ({
        // A psalm's heading is verse 0 and has no number.
        number:
          v.verse === 0 ? "" : (v.published ?? (v.to ? `${v.verse}–${v.to}` : String(v.verse))),
        text: editableText(v.content as never)
          .replace(/¶\s*/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      })),
      more: found.length > MAX_WIDGET_VERSES,
      attribution: attribution
        ? {
            designation: attribution.designation,
            statement: attribution.statement,
            links: attribution.links,
          }
        : null,
    };
  }
}
