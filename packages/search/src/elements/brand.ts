import { css, html } from "lit";
import { SearchElement } from "./base.ts";
import { tokens } from "./styles.ts";

/**
 * `<st-brand instance="main" href="https://scripture.tips/">`: the widget's footer credit, one
 * quiet line in the muted color, under the search or reader it belongs to. Words only (no
 * artwork, which keeps its own license: docs/branding.md §1), and it takes the instance's
 * `poweredBy` string so a site can translate it.
 */
export class StBrand extends SearchElement {
  static override properties = { ...SearchElement.properties, href: { type: String } };
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        margin-top: 0.5rem;
        text-align: end;
        font-size: 0.75rem;
      }
      a {
        color: var(--_muted);
        text-decoration: none;
        opacity: 0.8;
      }
      a:hover,
      a:focus-visible {
        color: var(--_accent);
        text-decoration: underline;
        opacity: 1;
      }
    `,
  ];

  declare href: string | undefined;

  protected override render() {
    const text = this.engine?.strings.poweredBy ?? "Powered by ScriptureTips";
    return html`<a part="brand" href=${this.href ?? "https://scripture.tips/"} target="_blank" rel="noopener">${text}</a>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "st-brand": StBrand;
  }
}
