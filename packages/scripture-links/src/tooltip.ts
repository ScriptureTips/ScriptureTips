import { type Client, ClientError } from "./client.ts";
import { readMoreUrl } from "./destination.ts";
import { bindHoverTip, type HoverTipBinding } from "./hover-tip.ts";
import { LINK_CLASS, OWNER_ATTRIBUTE, REF_ATTRIBUTE } from "./scan.ts";
import type {
  LinksEventName,
  LinksEvents,
  Strings,
  WidgetPassage,
  WidgetTranslation,
  WidgetVerse,
} from "./types.ts";

/** The tooltip's width, for keeping it in the window (px). */
const WIDTH = 360;
/** How long the pointer may be away before the tooltip goes (ms), so it can reach it. */
const LEAVE_MS = 250;
/** The pin's picture (a push pin), drawn in the button's color. */
const PIN_PATH = "M16 3l5 5-2 1-3 3 1 5-1.5 1.5L11 14l-5 6-1-1 6-5-4.5-4.5L8 8l5 1 3-3z";

/**
 * The tooltip's own font stack: named here, never inherited from the page.
 */
const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
/** The tooltip's text size, in CSS pixels, before the reader's text size (`--st-text-scale`). */
const BASE_PX = 15;

/**
 * The tooltip is ours, not the page's. Nothing from the page's styles reaches it:
 * - The host element, the one thing of ours in the page's own tree, has every property reset by
 *   inline `!important` declarations (`isolate`), which no page rule outranks. Inside the shadow
 *   root nothing is inherited, and no page selector matches.
 * - Every size is in pixels, or in `em` of the tooltip's own pixel size: never `rem`, which would
 *   follow the page's root font size.
 * - The font is our own stack (`FONT`), set here.
 * The website plugin may be themed by its site with these CSS custom properties on the page
 * (they pass into the shadow root): `--st-accent`, `--st-ink`, `--st-muted`, `--st-rule`,
 * `--st-paper`, `--st-radius`, `--st-font`. The browser extension turns that off (`isolated`).
 * The text sizes are all multiplied by `--st-text-scale` (1 unless the host asked for another:
 * `setTextScale`), so the reader can make the words larger or smaller without touching the
 * page's own text.
 */
const THEME_PROPERTIES = [
  "--st-accent",
  "--st-ink",
  "--st-muted",
  "--st-rule",
  "--st-paper",
  "--st-radius",
  "--st-font",
] as const;

const STYLES = `
  :host { all: initial; }
  .box {
    position: fixed; z-index: 2147483000; box-sizing: border-box;
    width: min(${WIDTH}px, calc(100vw - 16px)); max-height: min(70vh, calc(420px * var(--st-text-scale, 1)));
    display: flex; flex-direction: column; overflow: hidden;
    font-family: var(--st-font, ${FONT}); font-size: calc(${BASE_PX}px * var(--st-text-scale, 1)); line-height: 1.45;
    font-weight: 400; font-style: normal; letter-spacing: normal; word-spacing: normal; text-transform: none;
    text-align: start; text-indent: 0; text-shadow: none; white-space: normal; direction: ltr;
    color: var(--st-ink, #1d232a); background: var(--st-paper, #fff);
    border: 1px solid var(--st-rule, #dfe3e6); border-radius: var(--st-radius, 6px);
    box-shadow: 0 6px 18px rgb(0 30 60 / 0.2);
  }
  .box[hidden] { display: none; }
  header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 0.5em; padding: 0.75em 0.9em 0.4em; }
  .body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 0.9em; }
  h2 { margin: 0; font-size: 1.05em; font-weight: 600; }
  .tools { display: inline-flex; align-items: center; gap: 0.4em; margin-inline-start: auto; }
  label { display: inline-flex; align-items: center; gap: 0.3em; font-size: 0.9em; color: var(--st-muted, #5b6672); }
  select { font: inherit; max-width: 12em; color: inherit; background: var(--st-paper, #fff); border: 1px solid var(--st-rule, #dfe3e6); border-radius: 0.3em; }
  p { margin: 0.35em 0; }
  sup { margin-inline-end: 0.15em; font-size: 0.7em; color: var(--st-muted, #5b6672); }
  .note-mark { margin: 0; padding: 0 0.15em; font: inherit; font-size: 0.72em; line-height: 1; position: relative; top: -0.45em; color: var(--st-accent, #0054a5); background: transparent; border: 0; cursor: pointer; }
  .note-mark:focus-visible { outline: 2px solid var(--st-accent, #0054a5); outline-offset: 1px; }
  .note-tip {
    display: none; position: fixed; z-index: 1; box-sizing: border-box; width: max-content; max-width: min(260px, calc(100vw - 16px));
    padding: 0.5em 0.7em; font-size: 0.9em; line-height: 1.4; color: var(--st-ink, #1d232a); background: var(--st-paper, #fff);
    border: 1px solid var(--st-rule, #dfe3e6); border-radius: var(--st-radius, 6px); box-shadow: 0 3px 12px rgb(0 30 60 / 0.25);
  }
  .note[data-open] .note-tip { display: block; }
  .status { color: var(--st-muted, #5b6672); }
  .attribution { margin-top: 0.5em; font-size: 0.85em; color: var(--st-muted, #5b6672); }
  footer { flex: none; padding: 0.5em 0.9em 0.75em; }
  .body:last-child { padding-bottom: 0.75em; }
  footer .source { color: var(--st-muted, #5b6672); }
  a { color: var(--st-accent, #0054a5); }
  .pin {
    display: inline-flex; align-items: center; justify-content: center; width: 1.7em; height: 1.7em; padding: 0;
    color: var(--st-muted, #5b6672); background: transparent; border: 1px solid transparent; border-radius: 0.3em; cursor: pointer;
  }
  .pin:hover { border-color: var(--st-rule, #dfe3e6); }
  .pin[aria-pressed="true"] { color: #fff; background: var(--st-accent, #0054a5); border-color: var(--st-accent, #0054a5); }
  .pin svg { width: 1.1em; height: 1.1em; fill: currentColor; }
  a:focus-visible, select:focus-visible, .pin:focus-visible { outline: 2px solid var(--st-accent, #0054a5); outline-offset: 1px; }
  @media print { .box { display: none; } }
`;

/**
 * Resets the host element, the part of the tooltip that is in the page's own tree, so no page
 * rule can restyle, hide, move or scale it: inline and `!important`. (`all` leaves out `direction`
 * and custom properties, which are set apart.) With `themable` the page's `--st-*` properties
 * still pass in, so a site can theme the website plugin; otherwise they are turned off too.
 */
function isolate(host: HTMLElement, themable: boolean): void {
  const set = (property: string, value: string) =>
    host.style.setProperty(property, value, "important");
  set("all", "initial");
  set("direction", "ltr");
  set("unicode-bidi", "normal");
  if (!themable) for (const property of THEME_PROPERTIES) set(property, "initial");
}

/** Where *Read more* goes, and the name of the site it is (shown beside it) if not the reader. */
export interface ReadMore {
  readonly url: string;
  readonly source: string | null;
}

export interface TooltipOptions {
  readonly client: Client;
  readonly strings: Strings;
  readonly site: string;
  readonly hoverDelayMs: number;
  /** The translation a passage opens in (`translation.ts`). */
  readonly translation: (link: HTMLAnchorElement) => Promise<string>;
  /**
   * Where *Read more* goes for a passage: the destination the page's links go to (an outside
   * reading site, with its name beside the link), or the ScriptureTips reader if left out.
   */
  readonly readMore?: ((link: HTMLAnchorElement, passage: WidgetPassage) => ReadMore) | undefined;
  /** The reader chose another for this passage in the tooltip. */
  readonly choose: (link: HTMLAnchorElement, translation: string) => void;
  readonly emit: <K extends LinksEventName>(name: K, detail: LinksEvents[K]) => void;
  /** Whose links this tooltip shows (`LinksOptions.owner`): only those carrying the same owner. */
  readonly owner?: string | undefined;
  /** How much larger or smaller its text is than its own size (`LinksOptions.textScale`). */
  readonly textScale?: number | undefined;
  /** Whether the page's `--st-*` custom properties may theme it (`LinksOptions.themable`). */
  readonly themable?: boolean | undefined;
}

export interface Tooltip {
  /** Makes the tooltip's text larger or smaller (1 is its own size); an open one is placed again. */
  setTextScale(scale: number): void;
  /** Shows the passage for a link (what hovering or tapping does). */
  open(anchor: HTMLAnchorElement): void;
  close(): void;
  /** Takes the tooltip and its listeners away. */
  destroy(): void;
}

/**
 * The link an event is on, if it's one this tooltip shows: a link carrying the same owner (none
 * for the website plugin, `extension` for the browser extension), so a page with both shows one
 * tooltip per link.
 */
const linkFinder =
  (owner: string) =>
  (target: EventTarget | null): HTMLAnchorElement | null => {
    const a =
      target instanceof Element ? target.closest<HTMLAnchorElement>(`a.${LINK_CLASS}`) : null;
    return a && (a.getAttribute(OWNER_ATTRIBUTE) ?? "") === owner ? a : null;
  };

/**
 * The passage pop-up. On a mouse it opens when the pointer rests on a link (or the link takes
 * focus), stays while the pointer is over it, and goes with Escape or a press elsewhere, unless
 * the reader pinned it (then it stays, on its passage, until unpinned or closed from inside it, and
 * the other links open new tooltips beside it, so any number can be pinned); on a
 * touch screen the first tap on a link opens it instead of following the link, and *Read more* is
 * the way on. It lives in a shadow root, so the page's styles don't reach it and its own don't
 * leak out, and all its text is set as text, never as markup, whatever the API says.
 */
export function createTooltip(doc: Document, options: TooltipOptions): Tooltip {
  const linkOf = linkFinder(options.owner ?? "");
  const host = doc.createElement("div");
  host.className = "st-host";
  isolate(host, options.themable ?? true);
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = STYLES;
  root.append(style);
  doc.body.append(host);
  // The link whose tooltip is open is outlined, so it's clear which copy of a passage is being
  // looked at (the page's own styles can restyle it: `a.st-ref[aria-expanded="true"]`).
  const mark = doc.createElement("style");
  mark.className = "st-style";
  mark.textContent =
    'a.st-ref[aria-expanded="true"] { outline: 2px solid var(--st-accent, #0054a5); outline-offset: 2px; border-radius: 2px; }';
  doc.head.append(mark);

  /**
   * One tooltip. Only one is ever *unpinned* (the one the pointer or focus is on, which moves from
   * link to link); each one the reader pins stays, on its passage, until they unpin or close it (so
   * they can read it while they write a reply), and the next link then opens a new tooltip beside
   * it. So any number can be pinned, and never more than one other is open.
   */
  interface Panel {
    readonly box: HTMLDivElement;
    anchor: HTMLAnchorElement | null;
    pinned: boolean;
    // Each opening and each reload is numbered, so a late answer to an earlier one is dropped.
    latest: number;
  }
  const panels: Panel[] = [];
  const unpinned = (): Panel | undefined => panels.find((p) => !p.pinned);
  const panelOf = (target: EventTarget | null): Panel | undefined =>
    target instanceof Node ? panels.find((p) => p.box.contains(target)) : undefined;
  const panelFor = (link: HTMLAnchorElement | null): Panel | undefined =>
    link ? panels.find((p) => p.anchor === link) : undefined;
  const createPanel = (): Panel => {
    const box = doc.createElement("div");
    box.className = "box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", options.strings.tooltip);
    box.style.visibility = "hidden";
    root.append(box);
    const panel: Panel = { box, anchor: null, pinned: false, latest: 0 };
    panels.push(panel);
    return panel;
  };
  let openTimer: number | undefined;
  let leaveTimer: number | undefined;
  let lastPointer = "mouse";
  let lastDownAt = 0;
  let lastKeyAt = 0;
  // True while the select's focus is let go on purpose, which isn't the reader moving on.
  let releasing = false;
  // Set when the reader changes the translation: the select is rebuilt with the new passage, and
  // takes the focus back.
  let refocus = false;

  /** In the unpinned tooltip (the pinned ones don't take part in what moves it). */
  const inside = (target: EventTarget | null): boolean => {
    const open = unpinned();
    return !!open && target instanceof Node && open.box.contains(target);
  };

  /**
   * Whether the reader is using a tooltip: a control in it has the focus. The choices of a select
   * open outside the tooltip, so the pointer is away from it while it's being used, and it must
   * stay until the reader is done (Escape, a press elsewhere, or the focus moving on).
   */
  const inUse = (panel: Panel): boolean => {
    const active = root.activeElement;
    return active !== null && panel.box.contains(active);
  };

  /**
   * Under the link, or above it, whichever fits and covers fewer of the page's other passage
   * links: two copies of a passage near each other mustn't have the first's tooltip over the
   * second, or the reader can't reach the second (what they do there would change the first).
   */
  const place = (panel: Panel) => {
    const { box, anchor, pinned } = panel;
    if (!anchor) return;
    const view = {
      width: doc.documentElement.clientWidth,
      height: doc.documentElement.clientHeight,
    };
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(WIDTH, view.width - 16);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, view.width - width - 8));
    const height = box.offsetHeight;
    const room = { below: view.height - rect.bottom, above: rect.top };
    const others = [...doc.querySelectorAll<HTMLAnchorElement>(`a.${LINK_CLASS}`)]
      .filter((other) => other !== anchor)
      .map((other) => other.getBoundingClientRect());
    const covered = (top: number) =>
      others.filter(
        (r) => r.bottom > top && r.top < top + height && r.right > left && r.left < left + width,
      ).length;
    const fits = [rect.bottom + 6, rect.top - height - 6].filter(
      (top) => top >= 8 && top + height <= view.height - 8,
    );
    // The first that covers fewest (below, if they tie); when neither fits, where there's more room.
    const best = fits.sort((x, y) => covered(x) - covered(y))[0];
    let top =
      best ?? (room.below >= room.above ? rect.bottom + 6 : Math.max(8, rect.top - height - 6));
    // Pinned, it stays in the window when its link is scrolled away, as the reader goes to write.
    if (pinned) top = Math.min(Math.max(8, top), Math.max(8, view.height - height - 8));
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    // Seen only once it's in its place.
    box.style.visibility = "";
  };

  const status = (text: string) => {
    const p = doc.createElement("p");
    p.className = "status";
    p.textContent = text;
    return p;
  };

  /** The credit statement, with the words the license says to link made links. */
  const credit = (a: NonNullable<WidgetPassage["attribution"]>) => {
    const p = doc.createElement("p");
    p.className = "attribution";
    const rest = a.statement;
    // Each link's words, in the order they first appear in the statement.
    const spots = a.links
      .flatMap((l) => (rest.includes(l.text) ? [{ l, at: rest.indexOf(l.text) }] : []))
      .sort((x, y) => x.at - y.at);
    let done = 0;
    for (const { l, at } of spots) {
      if (at < done) continue;
      if (at > done) p.append(rest.slice(done, at));
      const link = doc.createElement("a");
      link.href = l.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = l.text;
      p.append(link);
      done = at + l.text.length;
    }
    if (done < rest.length) p.append(rest.slice(done));
    return p;
  };

  const content = (
    panel: Panel,
    translations: readonly WidgetTranslation[],
    chosen: string,
    passage: WidgetPassage | null,
    body: Node[],
    link: ReadMore | null,
  ) => {
    const head = doc.createElement("header");
    const h2 = doc.createElement("h2");
    h2.textContent = passage?.label ?? panel.anchor?.getAttribute("data-st-text") ?? "";
    const tools = doc.createElement("div");
    tools.className = "tools";
    head.append(h2, tools);
    if (translations.length > 1) {
      const label = doc.createElement("label");
      label.append(`${options.strings.translation} `);
      const select = doc.createElement("select");
      for (const t of translations) {
        const o = doc.createElement("option");
        o.value = t.id;
        o.textContent = t.abbreviation;
        o.title = t.name;
        o.selected = t.id === chosen;
        select.append(o);
      }
      select.addEventListener("change", () => {
        const link = panel.anchor;
        if (!link) return;
        // Chosen by the keyboard, the select keeps the focus; chosen by the pointer (the choices
        // open outside the tooltip) the focus is let go, or the tooltip would stay over what's
        // beside the link until the reader pressed elsewhere.
        refocus = lastKeyAt > lastDownAt;
        if (!refocus) {
          releasing = true;
          select.blur();
          releasing = false;
        }
        options.choose(link, select.value);
        options.emit("translation-change", {
          reference: link.getAttribute(REF_ATTRIBUTE) ?? "",
          translation: select.value,
        });
        void show(panel, link);
      });
      label.append(select);
      tools.append(label);
    }
    tools.append(pinButton(panel));
    const scroll = doc.createElement("div");
    scroll.className = "body";
    scroll.append(...body);
    const children: Node[] = [head, scroll];
    if (link) {
      const footer = doc.createElement("footer");
      const a = doc.createElement("a");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = options.strings.readMore;
      footer.append(a);
      if (link.source) {
        // The site it goes to, beside the link.
        const source = doc.createElement("span");
        source.className = "source";
        source.textContent = ` ${options.strings.readMoreOn} ${link.source}`;
        a.setAttribute(
          "aria-label",
          `${options.strings.readMore} ${options.strings.readMoreOn} ${link.source}`,
        );
        footer.append(source);
      }
      children.push(footer);
    }
    // The tooltip is rebuilt as the passage arrives or the translation changes: a select that had
    // the focus hands it to the new one, so the reader goes on using it.
    const { box } = panel;
    const active = box.contains(root.activeElement) ? root.activeElement : null;
    const keepFocus = refocus || active instanceof HTMLSelectElement;
    const keepPinFocus = active?.classList.contains("pin") ?? false;
    box.replaceChildren(...children);
    if (keepFocus) box.querySelector("select")?.focus();
    else if (keepPinFocus) box.querySelector<HTMLButtonElement>(".pin")?.focus();
    refocus = false;
  };

  const pinButton = (panel: Panel) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "pin";
    button.setAttribute("aria-label", options.strings.pin);
    button.title = options.strings.pin;
    button.setAttribute("aria-pressed", String(panel.pinned));
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", PIN_PATH);
    svg.append(path);
    button.append(svg);
    button.addEventListener("click", () => {
      const pinning = !panel.pinned;
      if (!pinning) {
        // Unpinned, it is the one that follows the pointer again, so the one that was is let go.
        const other = unpinned();
        if (other && other !== panel) close(other);
      }
      panel.pinned = pinning;
      if (pinning) {
        // Pinned, it is left where it is: the next link opens a new tooltip.
        window.clearTimeout(openTimer);
        window.clearTimeout(leaveTimer);
      }
      button.setAttribute("aria-pressed", String(panel.pinned));
      // Pressed with the pointer, the focus is let go, so the tooltip goes when the pointer leaves
      // once it's unpinned; pressed with the keyboard, the button keeps it.
      if (lastDownAt > lastKeyAt) {
        releasing = true;
        button.blur();
        releasing = false;
      }
      place(panel);
    });
    return button;
  };

  // The open notes' tips, placed when they open and let go when the page or the tooltip moves.
  const noteBindings = new Map<HTMLElement, HoverTipBinding>();
  let noteCount = 0;

  /** A verse's words with a mark for each translator's note, which shows the note as a tip. */
  const verseText = (v: WidgetVerse, p: HTMLElement): void => {
    // The tips of passages that have been replaced go.
    for (const [el, binding] of noteBindings)
      if (!el.isConnected) {
        binding.destroy();
        noteBindings.delete(el);
      }
    let from = 0;
    for (const n of v.notes ?? []) {
      const at = Math.min(Math.max(n.at, from), v.text.length);
      p.append(v.text.slice(from, at));
      from = at;
      const id = `st-note-${noteCount++}`;
      const wrapper = doc.createElement("span");
      wrapper.className = "note";
      const mark = doc.createElement("button");
      mark.type = "button";
      mark.className = "note-mark";
      mark.textContent = n.letter;
      mark.setAttribute("aria-describedby", id);
      const tip = doc.createElement("span");
      tip.className = "note-tip";
      tip.id = id;
      tip.setAttribute("role", "tooltip");
      tip.textContent = n.text;
      wrapper.append(mark, tip);
      p.append(wrapper);
      const binding = bindHoverTip(wrapper, {
        onChange: (open) => {
          if (!open) return;
          // Over the mark if it fits, else under it; kept in the window.
          const rect = mark.getBoundingClientRect();
          const width = doc.documentElement.clientWidth;
          const height = tip.offsetHeight;
          const left = Math.min(
            Math.max(8, rect.left + rect.width / 2 - tip.offsetWidth / 2),
            Math.max(8, width - tip.offsetWidth - 8),
          );
          tip.style.left = `${left}px`;
          tip.style.top = `${rect.top - height - 6 >= 8 ? rect.top - height - 6 : rect.bottom + 6}px`;
        },
      });
      noteBindings.set(wrapper, binding);
    }
    p.append(v.text.slice(from));
  };

  const verses = (passage: WidgetPassage): Node[] => {
    const nodes: Node[] = passage.verses.map((v) => {
      const p = doc.createElement("p");
      if (v.number) {
        const sup = doc.createElement("sup");
        sup.textContent = v.number;
        p.append(sup, " ");
      }
      verseText(v, p);
      return p;
    });
    if (passage.more) nodes.push(status(options.strings.more));
    if (passage.verses.length === 0) nodes.push(status(options.strings.missing));
    if (passage.attribution) nodes.push(credit(passage.attribution));
    return nodes;
  };

  async function show(panel: Panel, link: HTMLAnchorElement): Promise<void> {
    const mine = ++panel.latest;
    panel.anchor = link;
    link.setAttribute("aria-expanded", "true");
    const osis = link.getAttribute(REF_ATTRIBUTE) ?? "";
    let translations: readonly WidgetTranslation[] = [];
    let chosen = "";
    try {
      [translations, chosen] = await Promise.all([
        options.client.translations(),
        options.translation(link),
      ]);
    } catch {
      /* The passage's own request says what went wrong. */
    }
    if (mine !== panel.latest) return;
    if (!chosen) chosen = translations[0]?.id ?? "";
    content(panel, translations, chosen, null, [status(options.strings.loading)], null);
    place(panel);
    options.emit("tooltip-open", { reference: osis, translation: chosen });
    try {
      const passage = await options.client.passage(chosen, osis);
      if (mine !== panel.latest) return;
      content(
        panel,
        translations,
        chosen,
        passage,
        verses(passage),
        options.readMore?.(link, passage) ?? {
          url: readMoreUrl(options.site, passage.translation.id, passage.label),
          source: null,
        },
      );
      panel.box.dir = passage.translation.direction;
    } catch (error) {
      if (mine !== panel.latest) return;
      const missing =
        error instanceof ClientError &&
        (error.code === "not-in-canon" || error.code === "unknown-translation");
      content(
        panel,
        translations,
        chosen,
        null,
        [status(missing ? options.strings.missing : options.strings.failed)],
        null,
      );
    }
    place(panel);
  }

  /** Takes a tooltip away, pinned or not; its link is outlined no longer unless another has it. */
  const close = (panel: Panel) => {
    window.clearTimeout(openTimer);
    window.clearTimeout(leaveTimer);
    panel.latest++;
    panels.splice(panels.indexOf(panel), 1);
    panel.box.remove();
    const link = panel.anchor;
    panel.anchor = null;
    if (link && !panelFor(link)) link.removeAttribute("aria-expanded");
  };
  const closeUnpinned = () => {
    const open = unpinned();
    if (open) close(open);
  };
  const closeAll = () => {
    for (const panel of [...panels]) close(panel);
  };

  const open = (link: HTMLAnchorElement) => {
    window.clearTimeout(openTimer);
    window.clearTimeout(leaveTimer);
    // Already pinned: it is open, and stays as it is.
    if (panelFor(link)?.pinned) return;
    const current = unpinned();
    if (current?.anchor === link) return;
    // The unpinned one moves on to this link; with none, a new tooltip opens (pinned ones stay).
    if (current?.anchor && !panelFor(current.anchor)?.pinned) {
      current.anchor.removeAttribute("aria-expanded");
    }
    void show(current ?? createPanel(), link);
  };

  const leave = () => {
    window.clearTimeout(openTimer);
    window.clearTimeout(leaveTimer);
    const current = unpinned();
    if (!current) return;
    leaveTimer = window.setTimeout(() => {
      if (current.pinned || inUse(current)) return;
      if (panels.includes(current)) close(current);
    }, LEAVE_MS);
  };

  const listeners: [string, EventListener, boolean?][] = [
    [
      "pointerdown",
      (e) => {
        lastPointer = (e as PointerEvent).pointerType || "mouse";
        lastDownAt = Date.now();
        // Pinned, it stays while the reader works elsewhere on the page (writing a reply, say):
        // only the unpinned one goes with a press elsewhere.
        if (!linkOf(e.target) && !inside(e.composedPath()[0] ?? e.target)) closeUnpinned();
      },
      true,
    ],
    [
      "pointerover",
      (e) => {
        const path = e.composedPath();
        if (path.some((n) => n === host)) {
          // On the unpinned tooltip, it stays; on a pinned one, nothing changes.
          if (inside(path[0] ?? null)) window.clearTimeout(leaveTimer);
          return;
        }
        const link = linkOf(e.target);
        if (!link || panelFor(link)?.pinned || (e as PointerEvent).pointerType !== "mouse") return;
        window.clearTimeout(leaveTimer);
        window.clearTimeout(openTimer);
        openTimer = window.setTimeout(() => open(link), options.hoverDelayMs);
      },
    ],
    [
      "pointerout",
      (e) => {
        if ((e as PointerEvent).pointerType !== "mouse") return;
        const from = e.composedPath()[0] ?? null;
        const to = (e as PointerEvent).relatedTarget;
        const current = unpinned();
        if (!current) return;
        // Only the unpinned tooltip and its link are watched: leaving a pinned one changes nothing.
        const leftLink =
          linkOf(from) && linkOf(from) === current.anchor && linkOf(from) !== linkOf(to);
        const leftBox = inside(from) && !inside(to);
        if ((leftLink && !inside(to)) || leftBox) leave();
      },
    ],
    [
      "focusin",
      (e) => {
        // A tap focuses the link first and then clicks it: the click is what opens it then.
        if (lastPointer === "touch" && Date.now() - lastDownAt < 600) return;
        const link = linkOf(e.target);
        if (link) open(link);
      },
    ],
    [
      "focusout",
      (e) => {
        if (releasing) return;
        const to = (e as FocusEvent).relatedTarget;
        // The focus left the unpinned tooltip's link, or the tooltip, for somewhere else.
        const current = unpinned();
        const was = linkOf(e.target);
        if (current && (was === current.anchor || inside(e.target)) && !inside(to) && !linkOf(to))
          leave();
      },
    ],
    [
      "click",
      (e) => {
        const link = linkOf(e.target);
        // On a touch screen the first tap shows the passage; Read more is the way on.
        if (link && lastPointer === "touch") {
          e.preventDefault();
          // Pinned, it keeps its passage: the pin is the way out.
          const shown = panelFor(link);
          if (shown?.pinned) return;
          if (shown) close(shown);
          else open(link);
        }
      },
      true,
    ],
    [
      "keydown",
      (e) => {
        lastKeyAt = Date.now();
        if ((e as KeyboardEvent).key !== "Escape" || panels.length === 0) return;
        // Escape closes the tooltip it is pressed in, or on the link of; pressed elsewhere, only
        // the unpinned one (a pinned tooltip stays while the reader writes elsewhere on the page).
        const target = e.composedPath()[0] ?? e.target;
        const mine = panelOf(target) ?? panelFor(linkOf(target));
        if (mine) close(mine);
        else closeUnpinned();
      },
    ],
  ];
  for (const [type, fn, capture] of listeners) doc.addEventListener(type, fn, capture ?? false);
  const reposition = () => {
    for (const panel of panels) place(panel);
    // A note's tip is placed where it opened: it's let go when the page or the passage moves.
    for (const binding of noteBindings.values()) binding.close();
  };
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);

  const setTextScale = (scale: number) => {
    // On the tooltip's own host, so it reaches nothing else on the page.
    const valid = Number.isFinite(scale) && scale > 0;
    host.style.setProperty("--st-text-scale", String(valid ? scale : 1), "important");
    reposition();
  };
  setTextScale(options.textScale ?? 1);

  return {
    setTextScale,
    open,
    close: closeAll,
    destroy() {
      closeAll();
      for (const [type, fn, capture] of listeners)
        doc.removeEventListener(type, fn, capture ?? false);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      for (const binding of noteBindings.values()) binding.destroy();
      noteBindings.clear();
      host.remove();
      mark.remove();
    },
  };
}
