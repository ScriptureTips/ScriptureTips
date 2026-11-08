import type { WidgetTranslation } from "./types.ts";

/** What can say which translation a passage should open in, most explicit first. */
export interface TranslationSources {
  /** The reader's own choice for this passage, kept from before. */
  readonly chosen?: string | undefined;
  /** The translation the link's own address names (`t=`), if the page wrote it. */
  readonly linked?: string | undefined;
  /** An abbreviation written after the passage in the text ("John 3:16 (NLT)"). */
  readonly written?: string | undefined;
  /** What the visitor prefers (the site's `setPreferences`; our own pages pass the account's). */
  readonly preferred?: string | undefined;
  /** The plugin's configured default. */
  readonly configured?: string | undefined;
}

/** The translation used when nothing else says: the KJV, which is public domain. */
export const DEFAULT_TRANSLATION = "eng-kjv";

/**
 * The translation a passage opens in: the reader's own choice for it; else the one its link's
 * address names; else the abbreviation written after it; else the visitor's preference; else the
 * plugin's configured default; else the KJV, or the first listed. Each can name one the plugin
 * can't show (the NLT isn't here): that step is skipped, not the passage.
 */
export function chooseTranslation(
  sources: TranslationSources,
  listed: readonly WidgetTranslation[],
): string {
  const byId = (id: string | undefined) => (id && listed.some((t) => t.id === id) ? id : undefined);
  const byAbbreviation = (text: string | undefined) =>
    text ? listed.find((t) => t.abbreviation.toLowerCase() === text.toLowerCase())?.id : undefined;
  return (
    byId(sources.chosen) ??
    byId(sources.linked) ??
    byAbbreviation(sources.written) ??
    byId(sources.preferred) ??
    byId(sources.configured) ??
    byId(DEFAULT_TRANSLATION) ??
    listed[0]?.id ??
    ""
  );
}
