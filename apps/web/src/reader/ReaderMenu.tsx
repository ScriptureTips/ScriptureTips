"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useRef, useState, useTransition } from "react";
import type { TranslationOption } from "../translations/menu.ts";
import { readHref } from "./paths.ts";

/** A book in a section's menu: where it opens, and whether it's the one being read. */
export interface MenuBook {
  osis: string;
  name: string;
  href: string;
  current: boolean;
}

/** One of the book menus: Old Testament, New Testament, other scriptures. */
export interface MenuSection {
  id: string;
  label: string;
  /** Books in groups, each with a small heading when a menu holds more than one. */
  groups: { id: string; heading?: string; books: MenuBook[] }[];
  /** The book being read is in it. */
  current: boolean;
}

const EXPANDED_KEY = "reader-translations-expanded";

/**
 * Whether the translation list shows the translations besides the favourites, as the person left
 * it in this browser; `fallback` (the account's own choice) if they never chose, or the browser
 * won't say.
 */
function storedExpanded(fallback: boolean): boolean {
  try {
    const kept = localStorage.getItem(EXPANDED_KEY);
    return kept === "1" ? true : kept === "0" ? false : fallback;
  } catch {
    return fallback;
  }
}

function saveExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(EXPANDED_KEY, expanded ? "1" : "0");
  } catch {
    // Not kept: the list still works for this visit.
  }
}

/**
 * The reader's horizontal menu: the book menus (Old Testament, New Testament, other scriptures
 * where there are any) and Translation, each a dropdown under its button. A book is a link.
 *
 * Translation lists your compilations and your favourites always, and the other translations once
 * you've opened their collapsible heading (kept in this browser). Each is a toggle, several at a time: the passage is shown in each, stacked, and the
 * last one on can't be turned off, so one is always shown. The footer's checkboxes select or
 * deselect a whole group at once (your compilations, your favourites, the other translations).
 *
 * Only one dropdown is open at a time; Escape or a press outside closes it, and so does going to
 * a book.
 */
export function ReaderMenu({
  part,
  limit,
  sections,
  selected,
  tail,
  compilations,
  translations,
  labels,
}: {
  /** The book menus' bar, or the Translation dropdown (which sits under the chapter bar). */
  part: "books" | "translation";
  /** The most translations shown at once. */
  limit: number;
  sections: readonly MenuSection[];
  /** The translations shown, in order: the first is the path's. */
  selected: readonly string[];
  /** The path after the translation (`genesis/1`), kept as translations are toggled. */
  tail: string;
  compilations: readonly TranslationOption[];
  /** Favourites first (marked `favorite`), then the rest. */
  translations: readonly TranslationOption[];
  labels: {
    nav: string;
    translationNav: string;
    translation: string;
    yours: string;
    all: string;
    favourites: string;
    /** The collapsible heading over the other translations, and what it says while collapsed. */
    others: string;
    clickToShow: string;
    /** The footer's checkbox for the translations besides the favourites. */
    everything: string;
    /** Why the last translation can't be turned off. */
    last: string;
    /** Why no more can be turned on. */
    limit: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const bar = useRef<HTMLElement>(null);

  const favourites = translations.filter((o) => o.favorite);
  const others = translations.filter((o) => !o.favorite);
  // The other translations are listed once asked for. They start as the account's menus do (all,
  // unless "only favourites" is on); with no favourites there's nothing else to list.
  const [expanded, setExpanded] = useState(() =>
    storedExpanded(favourites.length === 0 || !translations.some((o) => o.more)),
  );
  const showOthers = expanded || favourites.length === 0;
  // Those shown now are listed even when the others are hidden, so they can be turned off.
  const listedOthers = showOthers ? others : others.filter((o) => selected.includes(o.id));

  // Going to a book (a new page) closes the menu; toggling a translation keeps it open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it closes when the path changes.
  useEffect(() => setOpen(null), [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(null);
      bar.current?.querySelector<HTMLElement>(`[aria-expanded="true"]`)?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const toggleButton = (id: string, label: string, extra?: string, current?: boolean) => (
    <button
      type="button"
      className={`reader-menu-toggle${current ? " reading" : ""}`}
      aria-expanded={open === id}
      aria-controls={`reader-menu-${id}`}
      onClick={() => setOpen(open === id ? null : id)}
    >
      {label}
      {extra ? <small>{extra}</small> : null}
      {/* The passage is loading in the translations just chosen. */}
      {id === "translation" && loading ? (
        <span className="spinner link-pending" aria-hidden="true" />
      ) : null}
    </button>
  );

  /** Shows these translations (the first is the path's); never none. */
  const show = (next: readonly string[]) => {
    if (next.length === 0) return;
    startLoading(() => router.push(readHref(next, tail), { scroll: false }));
  };
  /** Turns a translation on or off. The last one on stays. */
  const choose = (id: string) => {
    if (selected.includes(id)) return show(selected.filter((s) => s !== id));
    if (selected.length < limit) show([...selected, id]);
  };
  /** Selects a whole group, or deselects it (the last one on stays). */
  const chooseGroup = (group: readonly TranslationOption[], on: boolean) => {
    const ids = new Set(group.map((o) => o.id));
    if (on)
      return show(
        [...selected, ...group.map((o) => o.id).filter((id) => !selected.includes(id))].slice(
          0,
          limit,
        ),
      );
    const rest = selected.filter((id) => !ids.has(id));
    show(rest.length > 0 ? rest : selected.slice(0, 1));
  };
  const setOthers = (on: boolean) => {
    setExpanded(on);
    saveExpanded(on);
    // Hiding them turns them off (one always stays, and is still listed).
    if (!on && selected.some((id) => others.some((o) => o.id === id))) {
      const kept = selected.filter((id) => !others.some((o) => o.id === id));
      show(kept.length > 0 ? kept : selected.slice(0, 1));
    }
  };

  const choice = (o: TranslationOption) => {
    const on = selected.includes(o.id);
    const lastOn = on && selected.length === 1;
    const full = !on && selected.length >= limit;
    return (
      <li key={o.id}>
        <button
          type="button"
          className="reader-choice"
          aria-pressed={on}
          aria-disabled={lastOn || full || undefined}
          title={lastOn ? labels.last : full ? labels.limit : undefined}
          onClick={() => choose(o.id)}
        >
          <span className="reader-check" aria-hidden="true">
            {on ? "✓" : ""}
          </span>
          <span className="reader-choice-label">{o.label}</span>
        </button>
      </li>
    );
  };

  /** A footer checkbox for a group: all selected, none, or some (mixed). */
  const groupBox = (name: string, group: readonly TranslationOption[], text: string) => {
    const count = group.filter((o) => selected.includes(o.id)).length;
    return (
      <label>
        <input
          type="checkbox"
          name={name}
          checked={count === group.length && group.length > 0}
          disabled={group.length === 0}
          ref={(el) => {
            if (el) el.indeterminate = count > 0 && count < group.length;
          }}
          onChange={() => chooseGroup(group, count < group.length)}
        />
        {text}
      </label>
    );
  };

  return (
    <nav
      ref={bar}
      className={`reader-menu${part === "translation" ? " reader-menu-translation" : ""}`}
      aria-label={part === "books" ? labels.nav : labels.translationNav}
      style={{ "--pending": loading ? 1 : 0 } as CSSProperties}
    >
      <ul>
        {part === "books"
          ? sections.map((s) => (
              <li key={s.id}>{toggleButton(s.id, s.label, undefined, s.current)}</li>
            ))
          : null}
        {part === "translation" ? <li>{toggleButton("translation", labels.translation)}</li> : null}
      </ul>
      {(part === "books" ? sections : []).map((s) =>
        open === s.id ? (
          <div key={s.id} id={`reader-menu-${s.id}`} className="reader-menu-panel">
            {s.groups.map((g) => (
              <section key={g.id}>
                {g.heading ? <h2 className="book-menu-heading">{g.heading}</h2> : null}
                <ul className="reader-books">
                  {g.books.map((b) => (
                    <li key={b.osis}>
                      <Link
                        href={b.href}
                        aria-current={b.current ? "page" : undefined}
                        onClick={() => setOpen(null)}
                      >
                        {b.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null,
      )}
      {part === "translation" && open === "translation" ? (
        <div id="reader-menu-translation" className="reader-menu-panel reader-menu-translations">
          {/* One list in two columns: your compilations, your favourites, then (once asked for)
              the other translations, each group beginning under the one before. */}
          <div className="reader-menu-flow">
            {compilations.length > 0 ? (
              <section>
                <h2 className="book-menu-heading">{labels.yours}</h2>
                <ul className="reader-choices">{compilations.map(choice)}</ul>
              </section>
            ) : null}
            {favourites.length > 0 ? (
              <section>
                <h2 className="book-menu-heading">{labels.favourites}</h2>
                <ul className="reader-choices">{favourites.map(choice)}</ul>
              </section>
            ) : null}
            {others.length > 0 ? (
              <section>
                {favourites.length > 0 ? (
                  <h2 className="book-menu-heading">
                    <button
                      type="button"
                      className="reader-others-toggle"
                      aria-expanded={showOthers}
                      onClick={() => setOthers(!showOthers)}
                    >
                      {labels.others}
                      {showOthers ? null : <small>{labels.clickToShow}</small>}
                    </button>
                  </h2>
                ) : (
                  <h2 className="book-menu-heading">{labels.others}</h2>
                )}
                {listedOthers.length > 0 ? (
                  <ul className="reader-choices">{listedOthers.map(choice)}</ul>
                ) : null}
              </section>
            ) : null}
          </div>
          {/* The checkboxes pick whole groups; with only the one list (a guest) there's no group. */}
          {compilations.length > 0 || favourites.length > 0 ? (
            <div className="reader-menu-footer">
              {groupBox("compilations", compilations, labels.yours)}
              {groupBox("favourites", favourites, labels.favourites)}
              {showOthers ? groupBox("others", others, labels.everything) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
