import { alertDialog } from "@scripturetips/dialogs";
import { linkText } from "./format.ts";
import { addressFor, destinationOf, destinations, FORMAT_NAMES, fill } from "./pages.ts";
import { LINK_FORMATS, type LinkFormat, type Settings } from "./settings.ts";

/**
 * The link generator's form (vision §3.6), shared by its page (`tool.html`) and the window it opens
 * on a web page (`generator-window.ts`): the reader pastes what they're writing, chooses the format
 * and where links go (from their settings at first), and gets it back with the references linked.
 * Each change can be undone and redone.
 */
export const GENERATOR_HTML = `
  <p class="hint">Paste what you're writing, and every scripture reference in it becomes a link. References that are already links stay as they are.</p>
  <label for="text">Your text</label>
  <textarea id="text" spellcheck="false"></textarea>
  <div class="row">
    <label for="format">Format</label>
    <select id="format"></select>
    <button type="button" class="help" id="format-help" aria-label="Help: Format" title="What is this?">?</button>
  </div>
  <div class="row">
    <label for="destination">Links go to</label>
    <select id="destination"></select>
    <button type="button" class="quiet icon" id="configure" aria-label="Change where links can go, in the settings" title="Settings: where links go">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5l1.6 2.3 2.8-.5.9 2.7 2.7.9-.5 2.8 2.3 1.6-2.3 1.6.5 2.8-2.7.9-.9 2.7-2.8-.5L12 21.5l-1.6-2.3-2.8.5-.9-2.7-2.7-.9.5-2.8L2.2 12l2.3-1.6-.5-2.8 2.7-.9.9-2.7 2.8.5z"/></svg>
    </button>
  </div>
  <div class="row">
    <button type="button" id="apply">Add links</button>
    <button type="button" class="quiet" id="undo">Undo</button>
    <button type="button" class="quiet" id="redo">Redo</button>
    <button type="button" class="quiet" id="copy">Copy</button>
    <span class="status" id="status" role="status"></span>
  </div>`;

/**
 * Turns the form's own markup (a constant, never what a page or reader wrote) into nodes without
 * assigning `innerHTML`, which the stores' checks flag whatever is assigned.
 */
export function parseHtml(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
  const fragment = document.createDocumentFragment();
  fragment.append(...[...parsed.body.childNodes].map((node) => document.importNode(node, true)));
  return fragment;
}

/** What the help icon beside the format says. */
const FORMAT_HELP = {
  title: "Format",
  message:
    "Websites use different formats for the links they use.\n\n<strong>HTML:</strong> web pages, blogs and email written in HTML.\n\n<strong>BBCode (forums):</strong> most forums, where links look like [url=…]John 3:16[/url].\n\n<strong>Wiki markup:</strong> wikis, where a link is [address John 3:16].\n\n<strong>Markdown:</strong> GitHub, Reddit, notes apps and many blogs, where a link is [John 3:16](address).\n\nYour choice is kept as the default under the settings.\n\nIf the website has a preview button, just try one and then use the undo button if it doesn't look right.",
};

/**
 * Wires the form in `root` (which holds `GENERATOR_HTML`). The cog calls `openSettings`, where the
 * places links can go are set. Returns the text box, to focus.
 */
export function mountGenerator(
  root: ParentNode,
  settings: Settings,
  openSettings: () => void,
): HTMLTextAreaElement {
  const get = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`The generator has no #${id}.`);
    return el;
  };
  const text = get<HTMLTextAreaElement>("text");
  const format = get<HTMLSelectElement>("format");
  const destination = get<HTMLSelectElement>("destination");
  const undo = get<HTMLButtonElement>("undo");
  const redo = get<HTMLButtonElement>("redo");
  const status = get<HTMLSpanElement>("status");

  get<HTMLButtonElement>("format-help").addEventListener(
    "click",
    () => void alertDialog({ ...FORMAT_HELP, okLabel: "Got it" }),
  );

  fill(
    format,
    LINK_FORMATS.map((f) => ({ value: f, label: FORMAT_NAMES[f] })),
    settings.format,
  );
  fill(destination, destinations(settings), String(settings.destination));

  // Each state of the text: what it was before each change, and after.
  const history: string[] = [];
  let at = -1;
  const buttons = () => {
    undo.disabled = at <= 0;
    redo.disabled = at >= history.length - 1;
  };
  buttons();

  get<HTMLButtonElement>("apply").addEventListener("click", () => {
    const before = text.value;
    const after = linkText(
      before,
      format.value as LinkFormat,
      addressFor(settings, destinationOf(destination.value)),
    );
    if (after === before) {
      status.textContent = "No references to link.";
      return;
    }
    // A change after undoing drops what could have been redone.
    history.splice(at + 1);
    if (history[history.length - 1] !== before) history.push(before);
    history.push(after);
    at = history.length - 1;
    text.value = after;
    status.textContent = "Links added.";
    buttons();
  });
  undo.addEventListener("click", () => {
    if (at <= 0) return;
    text.value = history[--at] ?? "";
    status.textContent = "";
    buttons();
  });
  redo.addEventListener("click", () => {
    if (at >= history.length - 1) return;
    text.value = history[++at] ?? "";
    status.textContent = "";
    buttons();
  });
  get<HTMLButtonElement>("configure").addEventListener("click", openSettings);
  get<HTMLButtonElement>("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text.value);
      status.textContent = "Copied.";
    } catch {
      text.select();
      status.textContent = "Press Ctrl+C to copy.";
    }
  });
  return text;
}
