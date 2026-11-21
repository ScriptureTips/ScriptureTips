"use client";

import { useEffect, useState } from "react";
import { canonicalSpan } from "./selection.ts";

/** apps/api `TranslationNotes`: one translation's notes on the chapter's canonical verses. */
export interface TranslationNotes {
  readonly id: string;
  readonly abbreviation: string;
  readonly notes: readonly {
    readonly canonical: readonly string[];
    readonly caller: string;
    readonly body: unknown;
  }[];
}

const asked = new Map<string, Promise<TranslationNotes[]>>();

/** Every translation's notes on a span of canonical verses, asked once per span. */
function notesOn(span: string): Promise<TranslationNotes[]> {
  let found = asked.get(span);
  if (!found) {
    found = fetch(`/api/translations/notes?ref=${encodeURIComponent(span)}`)
      .then((res) =>
        res.ok ? (res.json() as Promise<{ translations: TranslationNotes[] }>) : null,
      )
      .then((body) => body?.translations ?? [])
      .catch(() => []);
    asked.set(span, found);
  }
  return found;
}

/**
 * Every translation's translator's notes on the chapter shown (its canonical verses, as the page
 * names them), followed as the page changes chapter. Empty until they've come.
 */
export function useChapterNotes(): readonly TranslationNotes[] {
  const [span, setSpan] = useState<string | null>(null);
  const [notes, setNotes] = useState<readonly TranslationNotes[]>([]);
  useEffect(() => {
    let timer: number | undefined;
    const look = () => setSpan(canonicalSpan(document.documentElement));
    look();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(look, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!span) return;
    let current = true;
    void notesOn(span).then((found) => {
      if (current) setNotes(found);
    });
    return () => {
      current = false;
    };
  }, [span]);
  return notes;
}
