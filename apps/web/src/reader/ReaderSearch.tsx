"use client";

import { getSearch } from "@scripturetips/search";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** The reader's search: its own instance of the core search. */
export const READER_SEARCH = "reader";

/**
 * The reader's search field, left of the Translation menu: a plain field with no label or
 * placeholder, a magnifying glass inside its right end (that is how it's known for a search), and
 * the core search's suggestions (passages, and verses found by their words) under it. It grows
 * to the full width while it has the focus, over the Translation menu, and a Search button
 * appears beside it (the stylesheet: `.reader-search`). Picking a suggestion opens it in the
 * reader, as on the home page: a passage in `translation`, a verse found by its words in the
 * translation it matched in.
 */
export function ReaderSearch({
  translation,
  catalog,
  labels,
}: {
  /** Where a passage opens (catalog ID). */
  translation: string;
  /** Every translation's catalog ID, to be searched. */
  catalog: readonly string[];
  labels: { field: string; button: string };
}) {
  const router = useRouter();
  // <st-search-input> is a web component, so it exists once the page's scripts have loaded; until
  // then a plain form stands in its place (the same look, and it works with scripts off).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void import("@scripturetips/search/elements")
      .then(() => customElements.whenDefined("st-search-input"))
      .then(() => setReady(true));
  }, []);

  useEffect(() => {
    getSearch(READER_SEARCH, {
      searchOnType: true,
      scope: {
        kinds: ["reference", "text"],
        translations: catalog.includes(translation)
          ? [translation, ...catalog.filter((c) => c !== translation)]
          : [...catalog],
        limit: 10,
      },
      strings: { label: labels.field, placeholder: "", search: labels.button },
    });
  }, [translation, catalog, labels.field, labels.button]);

  // Picking a suggestion goes straight to the reader (the widget's `onSelect`, which replaces its
  // own action of showing the passage in the field).
  useEffect(() => {
    getSearch(READER_SEARCH, {
      onSelect: ({ result }) => {
        if (result.kind === "original") return;
        const opensIn = result.kind === "text" ? result.translation.id : translation;
        router.push(
          `/read?t=${encodeURIComponent(opensIn)}&ref=${encodeURIComponent(result.label)}`,
        );
      },
    });
    return () => {
      getSearch(READER_SEARCH, { onSelect: null });
    };
  }, [router, translation]);

  return (
    <div className="reader-search">
      {ready ? (
        <st-search-input instance={READER_SEARCH} placeholder="" results-as-suggestions />
      ) : (
        <form className="reader-search-fallback" action="/read" method="get">
          <input type="hidden" name="t" value={translation} />
          <input name="ref" type="search" aria-label={labels.field} maxLength={200} required />
        </form>
      )}
    </div>
  );
}
