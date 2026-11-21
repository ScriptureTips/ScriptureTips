"use client";

import { useEffect, useState } from "react";
import { LAYERS_CHANGED } from "./layers.ts";
import { linkIn } from "./linkAnchor.ts";
import { type NoteListLabels, UserNoteGroups } from "./NoteGroups.tsx";

/** One note in the list: what its mark says, and where it is. */
interface Entry {
  /** The mark's link's id, which the list's letter jumps to (and flashes the verse). */
  markId: string;
  /** What the mark's link points at: this entry, so the mark jumps to the list. */
  id: string;
  letter: string;
  verse: string;
  /** The tip's content (drawn by the page itself: the note's text, or your note's passage link). */
  html: string;
  /** A translator's note, or one of the user's. */
  yours: boolean;
  /** The wording its verse is in (a translation's ID, or `@compilation`). */
  wordsIn: string;
}

/** `Gen.1.20` as `1:20`. */
const verseOf = (canonical: string): string =>
  canonical.split(" ")[0]?.split(".").slice(1).join(":") ?? "";

/**
 * The notes of the compare and edit views, in one list under the table (the read tab has one
 * under each passage): the translators' notes and the user's, as their marks show them (what the
 * footer hides isn't listed), in reading order. A letter jumps to its verse and flashes it
 * (`StudyLayers`); a mark jumps here.
 */
export function StudyNotesList({ labels }: { labels: NoteListLabels }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    let timer: number | undefined;
    const scan = () => {
      const next: Entry[] = [];
      for (const mark of document.querySelectorAll<HTMLElement>(
        ".reading :is(.note-mark, .user-note-mark)",
      )) {
        // Not the hidden layout (the phone's list or the table), nor what the footer hides.
        if (mark.getClientRects().length === 0) continue;
        const link = mark.querySelector<HTMLAnchorElement>(":scope > a");
        const unit = mark.closest(".verse-unit[data-canonical], .other-notes[data-canonical]");
        if (!link?.id || !unit) continue;
        next.push({
          markId: link.id,
          id: link.getAttribute("href")?.slice(1) ?? "",
          letter: link.textContent ?? "",
          verse: verseOf(unit.getAttribute("data-canonical") ?? ""),
          html: mark.querySelector(":scope > [role='tooltip']")?.innerHTML ?? "",
          yours: mark.classList.contains("user-note-mark"),
          wordsIn: linkIn(unit) ?? "",
        });
      }
      setEntries((was) =>
        was.length === next.length &&
        was.every((e, i) => e.markId === next[i]?.markId && e.html === next[i]?.html)
          ? was
          : next,
      );
    };
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 100);
    };
    scan();
    const observer = new MutationObserver((records) => {
      // Not its own changes.
      if (records.every((r) => (r.target as Element).closest?.(".compare-notes"))) return;
      soon();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-layer-hidden"],
    });
    window.addEventListener(LAYERS_CHANGED, soon);
    window.addEventListener("resize", soon);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener(LAYERS_CHANGED, soon);
      window.removeEventListener("resize", soon);
    };
  }, []);

  if (entries.length === 0) return null;
  const item = (e: Entry) => (
    <li key={e.markId} id={e.id}>
      <a className="note-letter" href={`#${e.markId}`}>
        {e.letter}
      </a>{" "}
      <span className="note-verse">{e.verse}</span>{" "}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the page's own tip, drawn by React (its text escaped there), with the plugin's links in it. */}
      <span dangerouslySetInnerHTML={{ __html: e.html }} />
    </li>
  );
  const translators = entries.filter((e) => !e.yours);
  const yours = entries.filter((e) => e.yours);
  return (
    <>
      {translators.length > 0 ? (
        <section className="notes compare-notes" aria-label={labels.translators}>
          <h2>{labels.translators}</h2>
          <ol>{translators.map(item)}</ol>
        </section>
      ) : null}
      {yours.length > 0 ? (
        <section className="notes compare-notes" aria-label={labels.yours}>
          <UserNoteGroups items={yours} labels={labels} wordsIn={(e) => e.wordsIn} render={item} />
        </section>
      ) : null}
    </>
  );
}
