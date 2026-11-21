"use client";

import { bindHoverTip } from "@scripturetips/scripture-links/hover-tip";
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from "react";
import { letter } from "../reader/layout.ts";
import { useChapterNotes } from "./chapterNotes.ts";
import {
  collectionShown,
  DEFAULT_COLLECTION,
  extraShown,
  LAYERS_CHANGED,
  type Layers,
  markSource,
  noteSources,
  notesShown,
  readLayers,
  SHOW_ALL,
  writeLayers,
} from "./layers.ts";
import { linkIn } from "./linkAnchor.ts";

export interface LayerLabels {
  readonly types: string;
  readonly notes: string;
  readonly yours: string;
  /** Under the translation notes' list, when none of the translations in view has any. */
  readonly noNotes: string;
  readonly defaultCollection: string;
  /** A compilation's own wording, as a source of notes. */
  readonly ownWording: string;
  /** For the checkbox of the word types (a switch). */
  readonly typesSwitch: string;
}

/** A checkbox with its label, whose tooltip (over the window's edge, never clipped) opens on hover. */
function LayerToggle({
  label,
  checked,
  disabled,
  onChange,
  tip,
  inputRef,
  switchLabel,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  tip: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  switchLabel?: string;
}) {
  const id = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    return bindHoverTip(el, {
      onChange: (open) => {
        const tipEl = body.current;
        if (!open || !tipEl) return;
        // Fixed, above the label: the window clips whatever is inside it, but not this.
        requestAnimationFrame(() => {
          const at = el.getBoundingClientRect();
          const width = tipEl.getBoundingClientRect().width;
          tipEl.style.bottom = `${window.innerHeight - at.top + 6}px`;
          tipEl.style.left = `${Math.max(8, Math.min(at.left, window.innerWidth - width - 8))}px`;
        });
      },
    }).destroy;
  }, []);
  return (
    <span ref={wrapper} className="hover-tip layer-toggle">
      <label>
        <input
          ref={inputRef}
          type="checkbox"
          {...(switchLabel
            ? { role: "switch", "aria-label": switchLabel, title: switchLabel }
            : {})}
          className="study-switch"
          checked={checked}
          disabled={disabled ?? false}
          aria-describedby={`${id}-tip`}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      <span ref={body} id={`${id}-tip`} role="tooltip" className="hover-tip-body layer-tip">
        {tip}
      </span>
    </span>
  );
}

/** One checkbox in a tooltip's list. */
function ListItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <li>
      <label>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    </li>
  );
}

/** What's on or off in a list of ids: `without` is those switched off. */
const toggled = (without: readonly string[], id: string, on: boolean): string[] =>
  on ? without.filter((x) => x !== id) : [...without.filter((x) => x !== id), id];

/**
 * The window's footer: the word types, the translators' notes and the user's own notes, each a
 * checkbox. Hovering a label opens a tooltip: what the colors mean (`legend`), the translations
 * with notes in view, each with a checkbox, and the user's note collections, each with one. The
 * translators' notes are hidden or shown here (marks in the text, by the translation they're in);
 * the user's notes are drawn by `StudyLinkMarks`, which reads the same remembered choice.
 */
export function StudyLayers({
  types,
  onTypes,
  typesRef,
  legend,
  names,
  labels,
}: {
  types: boolean;
  onTypes: (on: boolean) => void;
  typesRef: Ref<HTMLInputElement>;
  legend: ReactNode;
  /** Translation IDs to the names the user knows them by. */
  names: Readonly<Record<string, string>>;
  labels: LayerLabels;
}) {
  const [layers, setLayers] = useState<Layers>(SHOW_ALL);
  const [sources, setSources] = useState<string[]>([]);

  useEffect(() => {
    const read = () => setLayers(readLayers());
    read();
    window.addEventListener(LAYERS_CHANGED, read);
    return () => window.removeEventListener(LAYERS_CHANGED, read);
  }, []);
  const change = (next: Layers) => {
    setLayers(next);
    writeLayers(next);
  };

  // The translators' notes on the page, as the table fills in and changes.
  useEffect(() => {
    let timer: number | undefined;
    const scan = () =>
      setSources((was) => {
        const now = noteSources();
        return now.length === was.length && now.every((s, i) => s === was[i]) ? was : now;
      });
    scan();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // Hides the marks (and the list under a passage, when all are off) of what's switched off.
  useEffect(() => {
    const apply = () => {
      for (const mark of document.querySelectorAll(".note-mark")) {
        mark.toggleAttribute("data-layer-hidden", !notesShown(layers, markSource(mark)));
      }
      // The list under a passage: each note goes with its mark, and the list with its last note.
      for (const list of document.querySelectorAll(
        ".reading .notes:not(.user-notes, .compare-notes, .other-notes-list)",
      )) {
        let any = false;
        for (const li of list.querySelectorAll("li[data-words-in]")) {
          const shown = notesShown(layers, li.getAttribute("data-words-in") ?? "");
          li.toggleAttribute("data-layer-hidden", !shown);
          any ||= shown;
        }
        list.toggleAttribute("data-layer-hidden", !any && list.querySelector("li") !== null);
      }
      // The letters run on over what's shown: a passage's in the read tab; in compare and edit,
      // the whole table's (or the phone list's), in reading order, so the list under it has
      // each letter once.
      const groups = new Map<Element, HTMLElement[]>();
      for (const mark of document.querySelectorAll<HTMLElement>(".note-mark")) {
        const group =
          mark.closest(".passage") ??
          mark.closest(".compare-grid, .compare-phone") ??
          mark.closest(".verse-unit");
        if (group) groups.set(group, [...(groups.get(group) ?? []), mark]);
      }
      const set = (el: Element | null, text: string) => {
        if (el && el.textContent !== text) el.textContent = text;
      };
      for (const [group, marks] of groups) {
        // Re-lettered while some are hidden, or other translations' notes are among them.
        const hiding =
          !group.classList.contains("passage") ||
          marks.some(
            (m) => m.hasAttribute("data-layer-hidden") || m.closest("[data-note-source]") !== null,
          );
        const byNote = new Map<string, string>();
        let count = 0;
        for (const mark of marks) {
          const link = mark.querySelector("a");
          if (!link) continue;
          if (link.dataset["letter"] === undefined) link.dataset["letter"] = link.textContent ?? "";
          const original = link.dataset["letter"];
          // Not counted: hidden, or in the layout for the other screen width.
          const text = hiding
            ? mark.hasAttribute("data-layer-hidden") || mark.getClientRects().length === 0
              ? original
              : letter(count++)
            : original;
          set(link, text);
          byNote.set(link.id.replace(/-mark$/, ""), text);
        }
        for (const li of group.querySelectorAll(".notes li")) {
          const text = byNote.get(li.id);
          if (text !== undefined) set(li.querySelector(".note-letter"), text);
        }
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      // Study mode turning off puts them back.
      for (const el of document.querySelectorAll("[data-layer-hidden]"))
        el.removeAttribute("data-layer-hidden");
    };
  }, [layers]);

  // A letter in the list under a passage takes the reader to its mark, and flashes its verse.
  useEffect(() => {
    const flash = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a.note-letter") : null;
      const id = link?.getAttribute("href")?.slice(1);
      // A note of a translation not on the page sits under its verse, which names it.
      const unit = id
        ? document
            .getElementById(id)
            ?.closest(".verse-unit[data-canonical], .other-notes[data-canonical]")
        : null;
      if (!unit) return;
      const wording = linkIn(unit);
      const canonical = unit.getAttribute("data-canonical");
      const scope = unit.closest(".passage") ?? document;
      // A verse is several units in the read tab: the jump goes to the first, the verse's start.
      let start: HTMLElement | null = null;
      for (const u of scope.querySelectorAll<HTMLElement>(".verse-unit[data-canonical]")) {
        if (u.getAttribute("data-canonical") !== canonical) continue;
        if (linkIn(u) !== wording) continue;
        // The unit has no box of its own (`display: contents`): its words do.
        const words = u.querySelector<HTMLElement>(".verse-words");
        if (!words) continue;
        start ??= words;
        words.classList.remove("verse-flash");
        void words.offsetWidth;
        words.classList.add("verse-flash");
        words.addEventListener("animationend", () => words.classList.remove("verse-flash"), {
          once: true,
        });
      }
      if (start) {
        // To the verse's start, not to the mark in its text.
        event.preventDefault();
        start.scrollIntoView({ block: "start" });
      }
    };
    document.addEventListener("click", flash);
    return () => document.removeEventListener("click", flash);
  }, []);

  // Every translation's notes on the chapter: those not on the page can be shown too.
  const chapterNotes = useChapterNotes();
  const others = chapterNotes.filter((t) => !sources.includes(t.id));

  const sourceName = (s: string) => (s === "@compilation" ? labels.ownWording : (names[s] ?? s));
  const collection = DEFAULT_COLLECTION;

  return (
    <>
      <LayerToggle
        label={labels.types}
        checked={types}
        onChange={onTypes}
        inputRef={typesRef}
        switchLabel={labels.typesSwitch}
        tip={legend}
      />
      <LayerToggle
        label={labels.notes}
        checked={layers.notes && sources.length + others.length > 0}
        disabled={sources.length + others.length === 0}
        onChange={(on) => change({ ...layers, notes: on })}
        tip={
          sources.length + others.length === 0 ? (
            <p className="layer-empty">{labels.noNotes}</p>
          ) : (
            <ul className="layer-list">
              {sources.map((s) => (
                <ListItem
                  key={s}
                  label={sourceName(s)}
                  checked={notesShown(layers, s)}
                  onChange={(on) =>
                    change({
                      ...layers,
                      // Choosing one while all are off turns the layer on for it alone.
                      notes: layers.notes || on,
                      hiddenNotes: layers.notes
                        ? toggled(layers.hiddenNotes, s, on)
                        : sources.filter((x) => x !== s || !on),
                      extraNotes: layers.notes ? layers.extraNotes : [],
                    })
                  }
                />
              ))}
              {/* Translations not on the page: off until chosen. */}
              {others.map((o) => (
                <ListItem
                  key={o.id}
                  label={o.abbreviation}
                  checked={extraShown(layers, o.id)}
                  onChange={(on) =>
                    change({
                      ...layers,
                      notes: layers.notes || on,
                      hiddenNotes: layers.notes ? layers.hiddenNotes : sources,
                      extraNotes: on
                        ? [...layers.extraNotes.filter((x) => x !== o.id), o.id]
                        : layers.extraNotes.filter((x) => x !== o.id),
                    })
                  }
                />
              ))}
            </ul>
          )
        }
      />
      <LayerToggle
        label={labels.yours}
        checked={layers.yours}
        onChange={(on) => change({ ...layers, yours: on })}
        tip={
          <ul className="layer-list">
            <ListItem
              label={labels.defaultCollection}
              checked={collectionShown(layers, collection)}
              onChange={(on) =>
                change({
                  ...layers,
                  yours: layers.yours || on,
                  hiddenCollections: layers.yours
                    ? toggled(layers.hiddenCollections, collection, on)
                    : on
                      ? []
                      : [collection],
                })
              }
            />
          </ul>
        }
      />
    </>
  );
}
