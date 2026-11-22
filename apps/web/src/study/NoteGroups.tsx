"use client";

import { type ReactNode, useEffect, useState } from "react";
import { DEFAULT_COLLECTION, LAYERS_CHANGED, type Layers, readLayers } from "./layers.ts";
import { useSourceNames } from "./StudyProvider.tsx";
import { type Collection, useCollections } from "./yourNotes.ts";

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

/** The remembered layers, followed as the footer changes them. */
export function useLayers(): Layers {
  const [layers, setLayers] = useState(readLayers);
  useEffect(() => {
    const read = () => setLayers(readLayers());
    window.addEventListener(LAYERS_CHANGED, read);
    return () => window.removeEventListener(LAYERS_CHANGED, read);
  }, []);
  return layers;
}

/**
 * The groups the user's notes are listed in: the default collection (the notes in no other),
 * then each collection by title, those the footer shows only, with the notes in each.
 */
export function noteGroups<T>(
  items: readonly T[],
  collectionsOf: (item: T) => readonly string[],
  collections: readonly Collection[],
  layers: Layers,
  defaultTitle: string,
): { id: string; title: string; items: T[] }[] {
  return [{ id: DEFAULT_COLLECTION, title: defaultTitle }, ...collections]
    .filter((c) => layers.yours && !layers.hiddenCollections.includes(c.id))
    .map((c) => ({
      id: c.id,
      title: c.title,
      items: items.filter((item) => {
        const of = collectionsOf(item);
        return c.id === DEFAULT_COLLECTION ? of.length === 0 : of.includes(c.id);
      }),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * The user's notes under a list's heading: grouped by collection (the default one first, then
 * by title: a note in several is listed in each), then by the translation whose wording they're
 * pinned to, in the order they first come. `render` is told whether it's the note's first entry,
 * which alone carries the id its mark jumps to.
 */
export function UserNoteGroups<T>({
  items,
  wordsIn,
  collectionsOf,
  keyOf,
  render,
  labels,
}: {
  items: readonly T[];
  /** The wording an item is pinned to: a translation's ID, or `@compilation`. */
  wordsIn: (item: T) => string;
  /** The collections an item is in (none: the default collection). */
  collectionsOf: (item: T) => readonly string[];
  keyOf: (item: T) => string;
  render: (item: T, first: boolean) => ReactNode;
  labels: NoteListLabels;
}) {
  const names = useSourceNames();
  const collections = useCollections();
  const layers = useLayers();
  const groups = noteGroups(items, collectionsOf, collections, layers, labels.defaultCollection);
  const listed = new Set<string>();
  return (
    <>
      <h2>{labels.yours}</h2>
      {groups.map((g) => {
        const byWording = new Map<string, T[]>();
        for (const item of g.items) {
          const w = wordsIn(item);
          byWording.set(w, [...(byWording.get(w) ?? []), item]);
        }
        return (
          <section key={g.id} className="note-collection">
            <h3>{g.title}</h3>
            {[...byWording].map(([w, group]) => (
              <section key={w} className="note-translation">
                <h4>{w === "@compilation" ? labels.ownWording : (names[w] ?? w)}</h4>
                <ol>
                  {group.map((item) => {
                    const key = keyOf(item);
                    const first = !listed.has(key);
                    listed.add(key);
                    return render(item, first);
                  })}
                </ol>
              </section>
            ))}
          </section>
        );
      })}
    </>
  );
}
