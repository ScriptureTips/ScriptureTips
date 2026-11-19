"use client";

import { getSearch } from "@scripturetips/search";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/** The home page's search: its own instance of the core search, which an integration can address. */
export const HOME_SEARCH = "home";

/**
 * The home page's search: the core search field (a passage, words or a Strong's number), with its
 * results underneath. It always searches every translation. Picking a passage opens it in the
 * reader in `translation` (the visitor's first favorite, else the default); picking a verse found
 * by its words opens it in the translation it was found in.
 */
export function HomeSearch({
  translation,
  catalog,
  labels,
}: {
  /** Where a passage opens: the account's first favorite, else the default (catalog ID). */
  translation: string;
  /** Every translation's catalog ID, to be searched. */
  catalog: readonly string[];
  labels: {
    field: string;
    placeholder: string;
    /** What the page is already searched for, so its results show what to expect. */
    initial: string;
    button: string;
  };
}) {
  const router = useRouter();
  const id = useId();

  // Why there are two fields: <st-search-input> is a web component, so it only exists once the
  // page's scripts have loaded, and the field would pop in late. A plain field, written into the
  // server's HTML, stands in its place until then (so the page never has a gap, and it still reads
  // a passage with scripts off). When the component is ready, whatever was typed, and the focus,
  // move over to it and the plain field goes.
  const [ready, setReady] = useState(false);
  const fallback = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void import("@scripturetips/search/elements")
      .then(() => customElements.whenDefined("st-search-input"))
      .then(() => {
        const typed = fallback.current?.value ?? "";
        const focused = document.activeElement === fallback.current;
        const engine = getSearch(HOME_SEARCH);
        if (typed) {
          // Whatever was typed before the component was ready is kept, and left for the visitor.
          engine.setQuery(typed);
        } else {
          // The page opens with its example already searched, so the results show what to expect,
          // and the field itself stays empty, with its placeholder: the words are taken as the
          // search starts, so the field is cleared before it's drawn.
          const searching = engine.doSearch(labels.initial);
          engine.setQuery("");
          void searching;
        }
        setReady(true);
        if (focused)
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>(`st-search-input[instance="${HOME_SEARCH}"]`)
              ?.shadowRoot?.querySelector("input")
              ?.focus(),
          );
      });
  }, [labels.initial]);

  // The search covers every translation, `translation` first: a passage the visitor types is
  // looked up in the first one searched.
  useEffect(() => {
    getSearch(HOME_SEARCH, {
      scope: {
        kinds: ["reference", "text", "original"],
        translations: catalog.includes(translation)
          ? [translation, ...catalog.filter((c) => c !== translation)]
          : [...catalog],
        limit: 10,
        // The example verse shows whole, not cut after a few lines.
        previewLength: 600,
      },
      strings: { label: labels.field, placeholder: labels.placeholder, search: labels.button },
    });
  }, [translation, catalog, labels.field, labels.placeholder, labels.button]);

  // A passage or a verse picked opens in the reader. This is the widget's `onSelect`, not the
  // `select` event: a handler replaces the widget's own action (showing the passage in the field
  // first), so the visitor goes straight to the reader.
  useEffect(() => {
    getSearch(HOME_SEARCH, {
      onSelect: ({ result }) => {
        if (result.kind === "original") return;
        // A verse found by its words opens in the translation it matched in; a passage typed, in
        // the visitor's own.
        const opensIn = result.kind === "text" ? result.translation.id : translation;
        router.push(
          `/read?t=${encodeURIComponent(opensIn)}&ref=${encodeURIComponent(result.label)}`,
        );
      },
    });
    return () => {
      getSearch(HOME_SEARCH, { onSelect: null });
    };
  }, [router, translation]);

  return (
    <div className="home-search">
      <div className="search">
        <div className="search-ref">
          {/* The stand-in field (see above): the same look as the component, gone once it's ready. */}
          {ready ? null : (
            <form id={`${id}-fallback`} className="home-fallback" action="/read" method="get">
              <input type="hidden" name="t" value={translation} />
              <input
                ref={fallback}
                name="ref"
                aria-label={labels.field}
                placeholder={labels.placeholder}
                maxLength={200}
                required
              />
              <button type="submit">{labels.button}</button>
            </form>
          )}
          {ready ? <st-search-input instance={HOME_SEARCH} /> : null}
        </div>
      </div>
      <st-search-results instance={HOME_SEARCH} />
    </div>
  );
}
