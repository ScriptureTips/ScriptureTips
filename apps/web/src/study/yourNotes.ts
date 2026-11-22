"use client";

import { useEffect, useState } from "react";
import { DEFAULT_COLLECTION, type Layers } from "./layers.ts";
import type { Anchor } from "./linkAnchor.ts";

/**
 * The user's own notes in study mode: their links and their annotations (domain-model §3.1,
 * §3.4), both "annotations" in the collections sense (§3.6). They're fetched once for the
 * chapter shown, for the marks, the highlights and the lists, and again when one is made,
 * changed or removed (`NOTES_CHANGED`).
 */

/** Fired when one of the user's links or annotations is added, changed or removed. */
export const NOTES_CHANGED = "st-notes-changed";

/** Fired when the user's collections change (made, renamed, deleted). */
export const COLLECTIONS_CHANGED = "st-collections-changed";

interface Common {
  id: string;
  quote: string | null;
  anchor: Anchor | null;
  /** The collections it's in (their IDs); none is the default collection. */
  collections: string[];
}

/** apps/api `LinkView`, seen from the chapter. */
export interface LinkNote extends Common {
  kind: "link";
  other: { osis: string; label: string };
  end: "source" | "target";
  note: string | null;
}

/** apps/api `AnnotationView`. */
export interface AnnotationNote extends Common {
  kind: "annotation";
  passage: { osis: string; label: string };
  body: string;
}

export type YourNote = LinkNote | AnnotationNote;

/** apps/api `CollectionView`. */
export interface Collection {
  id: string;
  title: string;
  count: number;
}

const asked = new Map<string, Promise<YourNote[] | null>>();

if (typeof window !== "undefined")
  window.addEventListener(NOTES_CHANGED, () => {
    asked.clear();
  });

/**
 * The user's links (from either end) and annotations on a span of canonical verses, asked once
 * until one changes; null when they can't be had (signed out).
 */
export function yourNotesOn(span: string): Promise<YourNote[] | null> {
  let found = asked.get(span);
  if (!found) {
    const ref = encodeURIComponent(span);
    const get = <T>(url: string) =>
      fetch(url)
        .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
        .catch(() => null);
    found = Promise.all([
      get<{ links: Omit<LinkNote, "kind">[] }>(`/api/links?ref=${ref}`),
      get<{ annotations: Omit<AnnotationNote, "kind">[] }>(`/api/annotations?ref=${ref}`),
    ]).then(([links, annotations]) =>
      links === null && annotations === null
        ? null
        : [
            ...(links?.links ?? []).map((l): YourNote => ({ ...l, kind: "link" })),
            ...(annotations?.annotations ?? []).map(
              (a): YourNote => ({ ...a, kind: "annotation" }),
            ),
          ],
    );
    asked.set(span, found);
  }
  return found;
}

let collectionsAsked: Promise<Collection[]> | null = null;

if (typeof window !== "undefined")
  window.addEventListener(COLLECTIONS_CHANGED, () => {
    collectionsAsked = null;
  });

/** The user's collections, by title (none when signed out), followed as they change. */
export function useCollections(): Collection[] {
  const [collections, setCollections] = useState<Collection[]>([]);
  useEffect(() => {
    let current = true;
    const load = () => {
      collectionsAsked ??= fetch("/api/collections")
        .then((res) => (res.ok ? (res.json() as Promise<{ collections: Collection[] }>) : null))
        .then((body) => body?.collections ?? [])
        .catch(() => []);
      void collectionsAsked.then((found) => {
        if (current) setCollections(found);
      });
    };
    load();
    window.addEventListener(COLLECTIONS_CHANGED, load);
    return () => {
      current = false;
      window.removeEventListener(COLLECTIONS_CHANGED, load);
    };
  }, []);
  return collections;
}

/**
 * Whether a note is shown: one in no collection goes with the default collection; one in
 * collections, with any of them that's shown.
 */
export const noteShown = (layers: Layers, collections: readonly string[]): boolean =>
  layers.yours &&
  (collections.length === 0
    ? !layers.hiddenCollections.includes(DEFAULT_COLLECTION)
    : collections.some((c) => !layers.hiddenCollections.includes(c)));
