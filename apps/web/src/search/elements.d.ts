/** The search widget's elements, for JSX (`@scripturetips/search/elements` registers them). */

import type { HTMLAttributes, Ref } from "react";

interface SearchElementAttributes extends HTMLAttributes<HTMLElement> {
  /** Elements with the same instance share one search. */
  instance?: string;
  /** The kinds of result, space or comma separated: `reference text original`. */
  kinds?: string;
  /** The translations searched (catalog IDs), space or comma separated. */
  translations?: string;
  limit?: number;
  endpoint?: string;
  size?: "large";
  placeholder?: string;
  slot?: string;
}

declare module "react" {
  // biome-ignore lint/style/noNamespace: this is how JSX is told about custom elements.
  namespace JSX {
    interface IntrinsicElements {
      "st-search": SearchElementAttributes;
      "st-search-input": SearchElementAttributes & {
        "hide-button"?: boolean;
        /** The search's results are in the list under the field (`<st-search-input>`). */
        "results-as-suggestions"?: boolean;
        ref?: Ref<HTMLElement>;
      };
      "st-search-results": SearchElementAttributes;
    }
  }
}
