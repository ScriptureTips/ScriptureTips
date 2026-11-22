"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { VerseText, verseLabel } from "../compilations/CompareVerse.tsx";
import { errorCode, useErrorText } from "../compilations/errors.ts";
import type { Verse } from "../reader/api.ts";
import { type Anchor, anchorRanges, readAnchor } from "../study/linkAnchor.ts";
import { MAX_QUOTE } from "../study/links.ts";
import type { Wording } from "./items.ts";

/** apps/api `WordingView`. */
interface WordingView {
  in: string;
  compilation: string;
  abbreviation: string;
  name: string;
  direction: "ltr" | "rtl";
  verses: Verse[];
}

/** Words chosen in a wording: as they read, and where they're pinned. */
export interface Words {
  quote: string;
  anchor: Anchor;
}

/** The highlights' names (globals.css styles `::highlight(…)`). */
const PICKED = "annotation-picked";
const CURRENT = "annotation-current";

function paint(name: string, ranges: readonly Range[]): void {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  if (ranges.length === 0) CSS.highlights.delete(name);
  else CSS.highlights.set(name, new Highlight(...ranges));
}

/**
 * A passage's verses in one wording, drawn as the compare view draws them (`VerseText`), so words
 * are counted the same way (`readAnchor`, `anchorRanges`) and marks made on them land on them
 * there. With `mark`, those words are highlighted (an item's words as they are now); with
 * `onPick`, the user selects words, which stay highlighted after the selection goes (pressing a
 * button, typing a comment), and each selection is passed up (null: none that can be kept).
 */
export function PassageWords({
  passage,
  wording,
  compilation,
  label,
  mark,
  onPick,
}: {
  /** Canonical OSIS. */
  passage: string;
  wording: Wording;
  /** The compilation the words are read in (an anchor names it). */
  compilation: string;
  /** The verses' name, for the region. */
  label: string;
  mark?: Words | undefined;
  onPick?: ((words: Words | null) => void) | undefined;
}) {
  const t = useTranslations("annotations");
  const errorText = useErrorText();
  const scope = useRef<HTMLElement>(null);
  const [view, setView] = useState<WordingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // The latest of each, for the selection listener (added once).
  const latest = useRef({ onPick, view, compilation, t });
  useEffect(() => {
    latest.current = { onPick, view, compilation, t };
  });
  const picking = onPick !== undefined;

  useEffect(() => {
    let current = true;
    setView(null);
    setError(null);
    const query = new URLSearchParams({ ref: passage, in: wording.in, compilation });
    void fetch(`/api/annotations/wording?${query}`)
      .then(async (res) => {
        if (!current) return;
        if (!res.ok) {
          const code = await errorCode(res);
          if (current) setError(errorText(code));
          return;
        }
        const body = (await res.json()) as WordingView;
        if (current) setView(body);
      })
      .catch(() => current && setError(errorText("unavailable")));
    return () => {
      current = false;
    };
  }, [passage, wording.in, compilation, errorText]);

  useEffect(() => {
    const root = scope.current;
    if (!mark || !view || !root) return;
    paint(CURRENT, anchorRanges(root, mark.anchor, mark.quote, view.compilation || compilation));
    return () => paint(CURRENT, []);
  }, [mark, view, compilation]);

  useEffect(() => {
    if (!picking) return;
    const change = () => {
      const root = scope.current;
      const selection = window.getSelection();
      if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;
      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (!text) return;
      const { onPick: pass, view: shown, compilation: slug, t: words } = latest.current;
      const anchor = readAnchor(root, range, shown?.compilation || slug);
      if (!anchor || text.length > MAX_QUOTE) {
        setPicked(null);
        paint(PICKED, []);
        setError(words("noSelection"));
        pass?.(null);
        return;
      }
      setError(null);
      setPicked(text);
      paint(PICKED, [range.cloneRange()]);
      pass?.({ quote: text, anchor });
    };
    document.addEventListener("selectionchange", change);
    return () => {
      document.removeEventListener("selectionchange", change);
      paint(PICKED, []);
    };
  }, [picking]);

  // Other verses: what was picked in the last ones is gone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it runs when the verses change.
  useEffect(() => {
    setPicked(null);
    paint(PICKED, []);
    latest.current.onPick?.(null);
  }, [passage, wording.in, compilation]);

  return (
    <div className="passage-words">
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {view ? (
        <section ref={scope} className="word-picker-text" dir={view.direction} aria-label={label}>
          {view.verses.map((v) => (
            <p key={`${v.chapter}.${v.verse}`}>
              <VerseText
                verse={v}
                number={verseLabel(v)}
                source={view.in === "@compilation" ? v.source : view.in}
                inCompilation={view.in === "@compilation"}
              />
            </p>
          ))}
        </section>
      ) : null}
      {picking && picked ? <p>{t("selected", { text: picked })}</p> : null}
    </div>
  );
}
