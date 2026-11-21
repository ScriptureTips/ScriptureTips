"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Inline } from "../reader/api.ts";
import { letter, noteBody } from "../reader/layout.ts";
import { ShownText } from "../reader/ShownText.tsx";
import { HoverTip } from "../ui/HoverTip.tsx";
import { type TranslationNotes, useChapterNotes } from "./chapterNotes.ts";
import { extraShown, LAYERS_CHANGED, noteSources, notesShown, readLayers } from "./layers.ts";

type Note = TranslationNotes["notes"][number];

/** Where one note is drawn: its mark, in a place this makes in the page. */
interface Slot {
  key: string;
  el: HTMLElement;
  translation: { id: string; abbreviation: string };
  note: Note;
  /** The mark's id: its list entry's is the same less `-mark`. */
  id: string;
  letter: string;
}

/** `Gen.1.20` as `1:20`. */
const verseOf = (canonical: string): string => canonical.split(".").slice(1).join(":");

const safe = (text: string): string => text.replace(/[^\w-]/g, "-");

/** The note's text for its tip and its list entry, ending with whose it is. */
const body = (note: Note, abbreviation: string) => (
  <>
    <ShownText nodes={noteBody(note.body as Inline[])} /> ({abbreviation})
  </>
);

/**
 * The translator's notes of translations that aren't on the page, chosen in the study window's
 * footer (`extraNotes`, off until chosen). Their wording isn't shown, so there's nowhere in it to
 * put them: in the read tab each mark goes at the end of its verse; in compare and edit they go
 * under a rule below the verse in the compilation's column. The read tab lists them under the
 * passage, by translation; compare and edit list them with the other notes (`StudyNotesList`).
 * Lettering and hiding are `StudyLayers`'s (`data-note-source` names their translation).
 */
export function StudyOtherNotes({ heading }: { heading: string }) {
  const chapter = useChapterNotes();
  const [layers, setLayers] = useState(readLayers);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [lists, setLists] = useState<{ el: HTMLElement; items: Slot[] }[]>([]);

  useEffect(() => {
    const read = () => setLayers(readLayers());
    window.addEventListener(LAYERS_CHANGED, read);
    return () => window.removeEventListener(LAYERS_CHANGED, read);
  }, []);

  useEffect(() => {
    const made = new Map<string, HTMLElement>();
    let timer: number | undefined;
    const place = () => {
      // A translation with marks on the page goes by its own checkbox; the others are chosen.
      const marked = new Set(noteSources());
      const shown = chapter.filter((t) =>
        marked.has(t.id) ? notesShown(layers, t.id) : extraShown(layers, t.id),
      );
      const units = [...document.querySelectorAll<HTMLElement>(".verse-unit[data-canonical]")];
      // Its own wording of the verse is on screen (a column, or a verse taken from it): its
      // notes are drawn there.
      const inOwnWording = (id: string, verse: string) =>
        units.some(
          (u) =>
            u.dataset["wordsIn"] === id &&
            (u.dataset["canonical"] ?? "").split(" ").includes(verse),
        );
      const next: Slot[] = [];
      const counts = new Map<Element, number>();
      const slotIn = (key: string, parent: Element, attrs: Record<string, string>) => {
        let el = made.get(key);
        if (!el || !el.isConnected) {
          el = document.createElement("span");
          el.className = "other-note-slot";
          made.set(key, el);
        }
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        if (el.parentElement !== parent) parent.append(el);
        return el;
      };
      for (const t of shown) {
        t.notes.forEach((note, i) => {
          const verse = note.canonical[0];
          if (!verse || inOwnWording(t.id, verse)) return;
          const holding = units.filter((u) =>
            (u.dataset["canonical"] ?? "").split(" ").includes(verse),
          );
          // The read tab: the end of the verse (its last unit in each passage).
          const last = new Map<Element, HTMLElement>();
          for (const u of holding) {
            const passage = u.closest(".passage");
            if (passage) last.set(passage, u);
          }
          for (const [passage, u] of last) {
            const words = u.querySelector(".verse-words");
            if (!words) continue;
            const key = `${t.id}|${i}|${[...document.querySelectorAll(".passage")].indexOf(passage)}`;
            const el = slotIn(key, words, { "data-note-source": t.id });
            next.push({ key, el, translation: t, note, id: `other-${safe(key)}-mark`, letter: "" });
          }
          // Compare and edit: under the verse in the compilation's column.
          // Once: under the first shown verse that holds it (the hidden layout for the other
          // screen width, and a verse spanning rows, would repeat it).
          const own = holding.find(
            (u) =>
              !u.closest(".passage") &&
              u.dataset["linkIn"] === "@compilation" &&
              (u.closest("td, .compare-list-verse")?.getClientRects().length ?? 0) > 0,
          );
          for (const u of own ? [own] : []) {
            const cell = u.closest("td, .compare-list-verse");
            if (!cell) continue;
            let under = cell.querySelector<HTMLElement>(":scope > .other-notes");
            if (!under) {
              under = document.createElement("div");
              under.className = "other-notes";
            }
            // Last in the cell: React puts a re-rendered verse after it (switching view).
            if (cell.lastElementChild !== under) cell.append(under);
            under.setAttribute("data-canonical", verse);
            under.setAttribute("data-link-in", "@compilation");
            const key = `${t.id}|${i}|c${[...document.querySelectorAll(".verse-unit")].indexOf(u)}`;
            const el = slotIn(key, under, { "data-note-source": t.id });
            next.push({ key, el, translation: t, note, id: `other-${safe(key)}-mark`, letter: "" });
          }
        });
      }
      // Lettered in reading order within each passage, or each verse's place (StudyLayers letters
      // them again with the other marks in the read tab).
      next.sort((x, y) =>
        x.el === y.el
          ? 0
          : x.el.compareDocumentPosition(y.el) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
      );
      for (const s of next) {
        const group = s.el.closest(".passage") ?? s.el.parentElement ?? s.el;
        const n = counts.get(group) ?? 0;
        counts.set(group, n + 1);
        s.letter = letter(n);
      }
      for (const [key, el] of made)
        if (!next.some((s) => s.key === key)) {
          el.remove();
          made.delete(key);
        }
      for (const under of document.querySelectorAll(".other-notes"))
        if (!under.querySelector(".other-note-slot")) under.remove();
      setSlots((was) =>
        was.length === next.length &&
        was.every((s, i) => s.key === next[i]?.key && s.el === next[i]?.el)
          ? was
          : next,
      );
      // The read tab's list, under each passage that has some.
      const grouped = new Map<Element, Slot[]>();
      for (const s of next) {
        const passage = s.el.closest(".passage");
        if (passage) grouped.set(passage, [...(grouped.get(passage) ?? []), s]);
      }
      setLists((was) => {
        const now = [...grouped].map(([passage, items]) => {
          let el = passage.querySelector<HTMLElement>(":scope > .other-notes-list");
          if (!el) {
            el = document.createElement("section");
            el.className = "notes other-notes-list";
            // After the passage's own notes, before the user's.
            const before = passage.querySelector(":scope > .user-notes");
            passage.insertBefore(el, before);
          }
          return { el, items };
        });
        for (const l of document.querySelectorAll(".passage > .other-notes-list"))
          if (!now.some((x) => x.el === l)) l.remove();
        return was.length === now.length &&
          was.every((l, i) => l.el === now[i]?.el && l.items.length === now[i]?.items.length)
          ? was
          : now;
      });
    };
    place();
    const observer = new MutationObserver((records) => {
      // Not its own changes.
      if (
        records.every((r) =>
          (r.target as Element).closest?.(".other-note-slot, .other-notes, .other-notes-list"),
        )
      )
        return;
      window.clearTimeout(timer);
      timer = window.setTimeout(place, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      for (const el of made.values()) el.remove();
      for (const el of document.querySelectorAll(".other-notes, .other-notes-list")) el.remove();
      setSlots([]);
      setLists([]);
    };
  }, [chapter, layers]);

  const parts: ReactNode[] = [];
  for (const s of slots)
    parts.push(
      createPortal(
        <HoverTip
          as="sup"
          className="note-mark"
          tipClassName="note-tip"
          id={`${s.id}-tip`}
          tip={body(s.note, s.translation.abbreviation)}
        >
          <a href={`#${s.id.replace(/-mark$/, "")}`} id={s.id} aria-describedby={`${s.id}-tip`}>
            {s.letter}
          </a>
        </HoverTip>,
        s.el,
        s.key,
      ),
    );
  for (const [i, l] of lists.entries()) {
    const byTranslation = new Map<string, Slot[]>();
    for (const s of l.items)
      byTranslation.set(s.translation.abbreviation, [
        ...(byTranslation.get(s.translation.abbreviation) ?? []),
        s,
      ]);
    parts.push(
      createPortal(
        <>
          <h2>{heading}</h2>
          {[...byTranslation].map(([abbreviation, items]) => (
            <section key={abbreviation} className="note-translation">
              <h4>{abbreviation}</h4>
              <ol>
                {items.map((s) => (
                  <li key={s.key} id={s.id.replace(/-mark$/, "")}>
                    <a className="note-letter" href={`#${s.id}`}>
                      {s.letter}
                    </a>{" "}
                    <span className="note-verse">{verseOf(s.note.canonical[0] ?? "")}</span>{" "}
                    <ShownText nodes={noteBody(s.note.body as Inline[])} /> ({abbreviation})
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </>,
        l.el,
        `list${i}`,
      ),
    );
  }
  return <>{parts}</>;
}
