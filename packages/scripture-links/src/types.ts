/** The words the plugin shows (en-NZ). Any can be replaced through the options. */
export interface Strings {
  readonly loading: string;
  readonly failed: string;
  /** The translation doesn't have the passage (it numbers or includes books differently). */
  readonly missing: string;
  readonly readMore: string;
  readonly translation: string;
  /** The passage goes on past the verses shown. */
  readonly more: string;
  readonly tooltip: string;
}

/** A translation the plugin may show (`GET /api/widget/translations`). */
export interface WidgetTranslation {
  readonly id: string;
  readonly abbreviation: string;
  readonly name: string;
  readonly language: string;
  readonly direction: "ltr" | "rtl";
}

/** A passage's words (`GET /api/widget/passage`). */
export interface WidgetPassage {
  readonly translation: WidgetTranslation;
  /** As it reads in the translation's numbering ("Psalm 51:3–5"). */
  readonly label: string;
  readonly verses: readonly { readonly number: string; readonly text: string }[];
  readonly more: boolean;
  readonly attribution: {
    readonly designation: string;
    readonly statement: string;
    readonly links: readonly { readonly text: string; readonly url: string }[];
  } | null;
}

/** The numbering a page's references are read in (domain-model §2.2). */
export type Scheme = "kjv" | "hebrew" | "latin" | "greek" | "canonical";

export interface LinksOptions {
  /** The ScriptureTips API: `https://scripturetips.org/api`. */
  readonly api: string;
  /** The ScriptureTips site, where *Read more* opens; the API's own origin if left out. */
  readonly site?: string;
  /**
   * The translation a passage opens in when nothing says otherwise (catalog ID), after the
   * reader's own choice, the link's address and the abbreviation written after the passage, and the
   * visitor's preference; the KJV if left out (or the first the API lists).
   */
  readonly translation?: string;
  /** The numbering the page's references are in; the KJV's if left out. */
  readonly scheme?: Scheme;
  /**
   * Where a link goes: `scripturetips` (the reader on the site, the default), or a URL
   * template with `ST_REFERENCE`, `ST_TRANSLATION`, `ST_BOOKNAME`, `ST_CHAPTER` and `ST_VERSE`.
   */
  readonly destination?: string;
  /**
   * What an outside destination's `ST_TRANSLATION` names: that site's own code for the
   * translation ("KJV", "TLV"), which isn't a ScriptureTips catalog ID. Without it, the link names
   * the tooltip's translation. Not used for the ScriptureTips reader.
   */
  readonly destinationTranslation?: string;
  /**
   * Who makes the links (`data-st-owner`), when it isn't the website plugin: the browser extension
   * gives `extension`. Each tooltip shows only its own links, so a page running both shows one.
   */
  readonly owner?: string;
  /** Words to replace (to translate the plugin). */
  readonly strings?: Partial<Strings>;
  /** What to skip besides links, code and form fields: a CSS selector. `.st-ignore` always is. */
  readonly ignore?: string;
  /** How long the pointer rests on a reference before the tooltip opens (ms). 300. */
  readonly hoverDelayMs?: number;
  /** How the API is reached (the browser extension fetches through its background script). */
  readonly fetch?: typeof fetch;
  /**
   * Where the reader's translation choices are kept so they last (the page's own `localStorage`
   * if left out; `null` keeps them for the page only). They stay until the reader clears their
   * browser's storage, and are never sent anywhere.
   */
  readonly storage?: Storage | null;
}

/** What a page can listen for (`on`). */
export interface LinksEvents {
  /** A tooltip opened for a reference. */
  "tooltip-open": { reference: string; translation: string };
  /** The reader changed the translation in the tooltip. */
  "translation-change": { reference: string; translation: string };
  /** References were found and linked in a scan. */
  scan: { linked: number };
}

export type LinksEventName = keyof LinksEvents;
