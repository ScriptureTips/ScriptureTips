"use client";

import { useId } from "react";
import type { Verse } from "../reader/api.ts";
import { noteBody, withNoteMarks } from "../reader/layout.ts";
import { ShownText } from "../reader/ShownText.tsx";
import { useSourceNames, useStudy } from "../study/StudyProvider.tsx";
import { STUDY_SOURCES } from "../study/types.ts";

/** A verse's number as printed: its own label, or its range. */
export const verseLabel = (v: Verse) =>
  v.published ?? (v.to ? `${v.verse}–${v.to}` : String(v.verse));

/** The headings before a verse. */
export function VerseHeadings({ verse }: { verse: Verse }) {
  return verse.headings.map((h, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a verse's headings never reorder.
    <span key={i} className="compare-heading">
      <ShownText nodes={noteBody(h.content)} />
    </span>
  ));
}

/**
 * A verse in the compare and edit modes: its headings, its number, then its words. It's wrapped
 * in a span that adds no box (`.verse-unit`) naming the canonical verses it holds, and whose
 * wording it is (`data-words-in`: the translation's catalog ID, or `@compilation` where the
 * compilation changed it), so study mode can tell which verses and words a selection touches
 * (`readPick`) and mark the words a link is pinned to (`study/linkAnchor.ts`). The words alone
 * are in `.verse-words`, which offsets are counted in.
 */
export function VerseText({
  verse,
  number,
  source,
  inCompilation = false,
}: {
  /** The verse is the compilation's own (its column): links made in it are pinned to it. */
  inCompilation?: boolean;
  verse: Verse;
  number: string;
  /** The translation the words are from (catalog ID): study mode marks only some. */
  source?: string | undefined;
}) {
  const words = useStudy();
  const prefix = useId();
  const names = useSourceNames();
  const study = words && source && STUDY_SOURCES.has(source) ? words : null;
  return (
    <span
      className="verse-unit"
      data-canonical={verse.canonical.length > 0 ? verse.canonical.join(" ") : undefined}
      data-words-in={verse.edit || verse.rendering ? "@compilation" : source}
      data-link-in={inCompilation ? "@compilation" : undefined}
    >
      <VerseHeadings verse={verse} />
      <sup className="compare-number">{number}</sup>{" "}
      <span className="verse-words">
        {/* In study mode the translators' notes show as marks too (the window's footer hides them). */}
        <ShownText
          nodes={
            words
              ? withNoteMarks(verse, prefix, (id) => names[id], source)
              : noteBody(verse.content)
          }
          study={study}
        />
      </span>
    </span>
  );
}
