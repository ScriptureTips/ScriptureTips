"use client";

import type { ReactNode } from "react";
import { useSourceNames } from "./StudyProvider.tsx";

/** The headings of the lists of notes. */
export interface NoteListLabels {
  readonly translators: string;
  /** The heading of the read tab's list of notes of translations not on the page. */
  readonly otherTranslators: string;
  readonly yours: string;
  readonly defaultCollection: string;
  /** A compilation's own wording, as a translation's name. */
  readonly ownWording: string;
}

/**
 * The user's notes under a list's heading: grouped by collection (today only the default one,
 * which holds the annotations in no other collection), then by the translation whose wording
 * they're pinned to, in the order they first come.
 */
export function UserNoteGroups<T>({
  items,
  wordsIn,
  render,
  labels,
}: {
  items: readonly T[];
  /** The wording an item is pinned to: a translation's ID, or `@compilation`. */
  wordsIn: (item: T) => string;
  render: (item: T) => ReactNode;
  labels: NoteListLabels;
}) {
  const names = useSourceNames();
  const byWording = new Map<string, T[]>();
  for (const item of items) {
    const w = wordsIn(item);
    byWording.set(w, [...(byWording.get(w) ?? []), item]);
  }
  return (
    <>
      <h2>{labels.yours}</h2>
      <section className="note-collection">
        <h3>{labels.defaultCollection}</h3>
        {[...byWording].map(([w, group]) => (
          <section key={w} className="note-translation">
            <h4>{w === "@compilation" ? labels.ownWording : (names[w] ?? w)}</h4>
            <ol>{group.map(render)}</ol>
          </section>
        ))}
      </section>
    </>
  );
}
