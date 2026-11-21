"use client";

import {
  KEY_ATTRIBUTE,
  LINK_CLASS,
  REF_ATTRIBUTE,
  readMoreUrl,
  TEXT_ATTRIBUTE,
} from "@scripturetips/scripture-links";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { letter } from "../reader/layout.ts";
import { HoverTip } from "../ui/HoverTip.tsx";
import { collectionShown, DEFAULT_COLLECTION, LAYERS_CHANGED, readLayers } from "./layers.ts";
import { type Anchor, linkIn } from "./linkAnchor.ts";
import { type NoteListLabels, UserNoteGroups } from "./NoteGroups.tsx";
import { LINKS_CHANGED } from "./StudyLinkMarks.tsx";
import { AUTO_LINK } from "./StudyPassagePopups.tsx";
import { canonicalSpan } from "./selection.ts";

/** apps/api `LinkView`, as far as these marks need. */
interface Note {
  id: string;
  quote: string | null;
  anchor: Anchor | null;
  other: { osis: string; label: string };
}

/** Where a note is drawn: a mark at the end of a verse's words, lettered within its group (a passage, or the comparison table). */
interface Slot {
  key: string;
  el: HTMLElement;
  note: Note;
  /** `1`, `2` … (drawn as A, B …): in reading order within a passage (read) or a verse (compare, edit). */
  number: number;
  /** The verse it is on, as `1:20`. */
  verse: string;
}

/** A and B …, so they aren't taken for the translators' notes (a, b …). */
const mark = (n: number): string => letter(n - 1).toUpperCase();

/** `Gen.1.20` as `1:20`. */
const verseOf = (canonical: string): string => canonical.split(".").slice(1).join(":");

/** The id of a mark, which its entry in the list links to (the key has characters ids avoid). */
const markId = (key: string): string => `user-note-mark-${key.replace(/[^\w-]/g, "-")}`;

/**
 * What the mark's tip and the list under the passage say: the words, and where they lead, the
 * passage drawn as a link of the plugin (`StudyPassagePopups`), so it shows its text on hover.
 */
function NoteText({ note, base }: { note: Note; base: string }) {
  return (
    <>
      {note.quote ? `“${note.quote}” ` : null}→{" "}
      <a
        className={LINK_CLASS}
        href={readMoreUrl(location.origin, base, note.other.label)}
        target="_blank"
        rel="noopener"
        aria-haspopup="dialog"
        {...{ [REF_ATTRIBUTE]: note.other.osis, [TEXT_ATTRIBUTE]: note.other.label }}
        {...AUTO_LINK}
        {...{ [KEY_ATTRIBUTE]: note.id }}
      >
        {note.other.label}
      </a>
    </>
  );
}

/** The marks and list of the user's notes (today the scripture links in the default collection). */
export function StudyUserNotes({ labels, base }: { labels: NoteListLabels; base: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [lists, setLists] = useState<{ el: HTMLElement; items: Slot[] }[]>([]);
  const [layers, setLayers] = useState(readLayers);

  useEffect(() => {
    let current = true;
    const load = () => {
      const span = canonicalSpan(document.documentElement);
      if (!span) return;
      fetch(`/api/links?ref=${encodeURIComponent(span)}`)
        .then((res) => (res.ok ? (res.json() as Promise<{ links: Note[] }>) : null))
        .catch(() => null)
        .then((found) => {
          if (current && found) setNotes(found.links);
        });
    };
    load();
    const read = () => setLayers(readLayers());
    window.addEventListener(LINKS_CHANGED, load);
    window.addEventListener(LAYERS_CHANGED, read);
    return () => {
      current = false;
      window.removeEventListener(LINKS_CHANGED, load);
      window.removeEventListener(LAYERS_CHANGED, read);
    };
  }, []);

  // Finds where each shown note goes as the page fills in, and keeps the places it makes.
  useEffect(() => {
    const shown = collectionShown(layers, DEFAULT_COLLECTION) ? notes : [];
    const made = new Map<string, HTMLElement>();
    let timer: number | undefined;
    const place = () => {
      const next: Slot[] = [];
      const counts = new Map<Element, number>();
      for (const note of shown) {
        const a = note.anchor;
        if (!a) continue;
        // A verse in the read tab is several units (one per run of its text): the mark goes at
        // the end of the last. In compare and edit, a verse is one unit per column.
        const units = [...document.querySelectorAll(".verse-unit[data-canonical]")].filter(
          (unit) =>
            linkIn(unit) === a.in &&
            (unit.getAttribute("data-canonical") ?? "").split(" ").includes(a.end.verse),
        );
        const last = new Map<Element, Element>();
        for (const unit of units) {
          const passage = unit.closest(".passage");
          if (passage) last.set(passage, unit);
        }
        for (const unit of units) {
          const passage = unit.closest(".passage");
          if (passage && last.get(passage) !== unit) continue;
          const words = unit.querySelector(".verse-words");
          if (!words) continue;
          const key = `${note.id}|${a.end.verse}|${unit.closest(".passage") ? "p" : ""}${[...document.querySelectorAll(".verse-unit")].indexOf(unit)}`;
          let el = made.get(key);
          if (!el || !el.isConnected) {
            el = document.createElement("span");
            el.className = "user-note-slot";
            made.set(key, el);
          }
          if (el.parentElement !== words) words.append(el);
          next.push({ key, el, note, number: 0, verse: verseOf(a.end.verse) });
        }
      }
      // In reading order (the verses', not the order the links were made in), then lettered.
      next.sort((x, y) =>
        x.el === y.el
          ? 0
          : x.el.compareDocumentPosition(y.el) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
      );
      for (const s of next) {
        // A passage's in the read tab; the whole table's (or phone list's) in compare and edit,
        // so the list under it has each letter once. The layout hidden at this width counts apart.
        const shown = s.el.getClientRects().length > 0;
        const group =
          s.el.closest(".passage") ??
          (shown ? s.el.closest(".compare-grid, .compare-phone") : null) ??
          s.el.closest(".verse-unit") ??
          s.el;
        s.number = (counts.get(group) ?? 0) + 1;
        counts.set(group, s.number);
      }
      for (const [key, el] of made)
        if (!next.some((s) => s.key === key)) {
          el.remove();
          made.delete(key);
        }
      setSlots((was) =>
        was.length === next.length &&
        was.every(
          (s, i) => s.key === next[i]?.key && s.el === next[i]?.el && s.number === next[i]?.number,
        )
          ? was
          : next,
      );
      // A list under each passage that has some (read mode: compare and edit have none).
      const grouped = new Map<Element, Slot[]>();
      for (const s of next) {
        const passage = s.el.closest(".passage");
        if (passage) grouped.set(passage, [...(grouped.get(passage) ?? []), s]);
      }
      setLists((was) => {
        const now = [...grouped].map(([passage, items]) => {
          let el = passage.querySelector<HTMLElement>(":scope > .user-notes");
          if (!el) {
            el = document.createElement("section");
            el.className = "notes user-notes";
            passage.append(el);
          }
          return { el, items };
        });
        for (const p of document.querySelectorAll(".passage > .user-notes"))
          if (!now.some((l) => l.el === p)) p.remove();
        return was.length === now.length &&
          was.every((l, i) => l.el === now[i]?.el && l.items.length === now[i]?.items.length)
          ? was
          : now;
      });
    };
    place();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(place, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      for (const el of made.values()) el.remove();
      for (const p of document.querySelectorAll(".passage > .user-notes")) p.remove();
      setSlots([]);
      setLists([]);
    };
  }, [notes, layers]);

  const parts: ReactNode[] = [];
  for (const s of slots)
    parts.push(
      createPortal(
        <HoverTip
          as="sup"
          className="user-note-mark"
          tipClassName="note-tip"
          id={`user-note-${s.key}-tip`}
          tip={<NoteText note={s.note} base={base} />}
        >
          <a
            href={`#${markId(s.key)}-note`}
            id={markId(s.key)}
            aria-describedby={`user-note-${s.key}-tip`}
          >
            {mark(s.number)}
          </a>
        </HoverTip>,
        s.el,
        s.key,
      ),
    );
  for (const [i, l] of lists.entries())
    parts.push(
      createPortal(
        <UserNoteGroups
          items={l.items}
          labels={labels}
          wordsIn={(s) => s.note.anchor?.in ?? ""}
          render={(s) => (
            <li key={s.key} id={`${markId(s.key)}-note`}>
              <a className="note-letter" href={`#${markId(s.key)}`}>
                {mark(s.number)}
              </a>{" "}
              <span className="note-verse">{s.verse}</span> <NoteText note={s.note} base={base} />
            </li>
          )}
        />,
        l.el,
        `list${i}`,
      ),
    );
  return <>{parts}</>;
}
