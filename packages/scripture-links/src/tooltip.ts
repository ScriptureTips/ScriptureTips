import { type Client, ClientError } from "./client.ts";
import { readMoreUrl } from "./destination.ts";
import { LINK_CLASS, REF_ATTRIBUTE } from "./scan.ts";
import type {
  LinksEventName,
  LinksEvents,
  Strings,
  WidgetPassage,
  WidgetTranslation,
} from "./types.ts";

/** The tooltip's width, for keeping it in the window (px). */
const WIDTH = 360;
/** How long the pointer may be away before the tooltip goes (ms), so it can reach it. */
const LEAVE_MS = 250;

/**
 * Theme the tooltip with these CSS custom properties on the page (they pass into the shadow
 * root): `--st-accent`, `--st-ink`, `--st-muted`, `--st-rule`, `--st-paper`, `--st-radius`,
 * `--st-font`. Nothing from the page's own styles reaches in otherwise.
 */
const STYLES = `
  :host { all: initial; }
  .box {
    position: fixed; z-index: 2147483000; box-sizing: border-box;
    width: min(${WIDTH}px, calc(100vw - 16px)); max-height: min(70vh, 28rem); overflow: auto;
    padding: 0.7rem 0.85rem; font: 0.9rem/1.45 var(--st-font, system-ui, -apple-system, "Segoe UI", sans-serif);
    color: var(--st-ink, #1d232a); background: var(--st-paper, #fff);
    border: 1px solid var(--st-rule, #dfe3e6); border-radius: var(--st-radius, 0.4rem);
    box-shadow: 0 0.5rem 1.4rem rgb(0 30 60 / 0.2);
  }
  .box[hidden] { display: none; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.4rem; }
  h2 { margin: 0; font-size: 0.95rem; font-weight: 600; }
  label { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; color: var(--st-muted, #5b6672); }
  select { font: inherit; max-width: 11rem; color: inherit; background: var(--st-paper, #fff); border: 1px solid var(--st-rule, #dfe3e6); border-radius: 0.3rem; }
  p { margin: 0.35rem 0; }
  sup { margin-inline-end: 0.15rem; font-size: 0.7em; color: var(--st-muted, #5b6672); }
  .status { color: var(--st-muted, #5b6672); }
  .attribution { margin-top: 0.5rem; font-size: 0.75rem; color: var(--st-muted, #5b6672); }
  footer { margin-top: 0.5rem; }
  a { color: var(--st-accent, #0054a5); }
  a:focus-visible, select:focus-visible { outline: 2px solid var(--st-accent, #0054a5); outline-offset: 1px; }
  @media print { .box { display: none; } }
`;

export interface TooltipOptions {
  readonly client: Client;
  readonly strings: Strings;
  readonly site: string;
  readonly hoverDelayMs: number;
  /** The translation a passage opens in (`translation.ts`). */
  readonly translation: (link: HTMLAnchorElement) => Promise<string>;
  /** The reader chose another for this passage in the tooltip. */
  readonly choose: (link: HTMLAnchorElement, translation: string) => void;
  readonly emit: <K extends LinksEventName>(name: K, detail: LinksEvents[K]) => void;
}

export interface Tooltip {
  /** Shows the passage for a link (what hovering or tapping does). */
  open(anchor: HTMLAnchorElement): void;
  close(): void;
  /** Takes the tooltip and its listeners away. */
  destroy(): void;
}

const linkOf = (target: EventTarget | null): HTMLAnchorElement | null =>
  target instanceof Element ? target.closest<HTMLAnchorElement>(`a.${LINK_CLASS}`) : null;

/**
 * The passage pop-up. On a mouse it opens when the pointer rests on a link (or the link takes
 * focus), stays while the pointer is over it, and goes with Escape or a press elsewhere; on a
 * touch screen the first tap on a link opens it instead of following the link, and *Read more* is
 * the way on. It lives in a shadow root, so the page's styles don't reach it and its own don't
 * leak out, and all its text is set as text, never as markup, whatever the API says.
 */
export function createTooltip(doc: Document, options: TooltipOptions): Tooltip {
  const host = doc.createElement("div");
  host.className = "st-host";
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = STYLES;
  const box = doc.createElement("div");
  box.className = "box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", options.strings.tooltip);
  box.hidden = true;
  root.append(style, box);
  doc.body.append(host);
  // The link whose tooltip is open is outlined, so it's clear which copy of a passage is being
  // looked at (the page's own styles can restyle it: `a.st-ref[aria-expanded="true"]`).
  const mark = doc.createElement("style");
  mark.className = "st-style";
  mark.textContent =
    'a.st-ref[aria-expanded="true"] { outline: 2px solid var(--st-accent, #0054a5); outline-offset: 2px; border-radius: 2px; }';
  doc.head.append(mark);

  let anchor: HTMLAnchorElement | null = null;
  // Each opening and each reload is numbered, so a late answer to an earlier one is dropped.
  let latest = 0;
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

  /** In the tooltip: `contains` doesn't look into a shadow root, so its own root is asked. */
  const inside = (target: EventTarget | null): boolean =>
    target instanceof Node &&
    (target === host || host.contains(target) || target.getRootNode() === root);

  /**
   * Whether the reader is using the tooltip: a control in it has the focus. The choices of a select
   * open outside the tooltip, so the pointer is away from it while it's being used, and it must
   * stay until the reader is done (Escape, a press elsewhere, or the focus moving on).
   */
  const inUse = (): boolean => root.activeElement !== null;

  /**
   * Under the link, or above it, whichever fits and covers fewer of the page's other passage
   * links: two copies of a passage near each other mustn't have the first's tooltip over the
   * second, or the reader can't reach the second (what they do there would change the first).
   */
  const place = () => {
    if (!anchor || box.hidden) return;
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
    const top =
      best ?? (room.below >= room.above ? rect.bottom + 6 : Math.max(8, rect.top - height - 6));
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
    translations: readonly WidgetTranslation[],
    chosen: string,
    passage: WidgetPassage | null,
    body: Node[],
    link: string | null,
  ) => {
    const head = doc.createElement("header");
    const h2 = doc.createElement("h2");
    h2.textContent = passage?.label ?? anchor?.getAttribute("data-st-text") ?? "";
    head.append(h2);
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
        const link = anchor;
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
        void show(link);
      });
      label.append(select);
      head.append(label);
    }
    const children: Node[] = [head, ...body];
    if (link) {
      const footer = doc.createElement("footer");
      const a = doc.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = options.strings.readMore;
      footer.append(a);
      children.push(footer);
    }
    // The tooltip is rebuilt as the passage arrives or the translation changes: a select that had
    // the focus hands it to the new one, so the reader goes on using it.
    const keepFocus = refocus || root.activeElement instanceof HTMLSelectElement;
    box.replaceChildren(...children);
    if (keepFocus) box.querySelector("select")?.focus();
    refocus = false;
  };

  const verses = (passage: WidgetPassage): Node[] => {
    const nodes: Node[] = passage.verses.map((v) => {
      const p = doc.createElement("p");
      if (v.number) {
        const sup = doc.createElement("sup");
        sup.textContent = v.number;
        p.append(sup, " ");
      }
      p.append(v.text);
      return p;
    });
    if (passage.more) nodes.push(status(options.strings.more));
    if (passage.verses.length === 0) nodes.push(status(options.strings.missing));
    if (passage.attribution) nodes.push(credit(passage.attribution));
    return nodes;
  };

  async function show(link: HTMLAnchorElement): Promise<void> {
    const mine = ++latest;
    anchor = link;
    link.setAttribute("aria-expanded", "true");
    const osis = link.getAttribute(REF_ATTRIBUTE) ?? "";
    // Until it has been placed it would sit where it falls in the page, at the end of it.
    if (box.hidden) box.style.visibility = "hidden";
    box.hidden = false;
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
    if (mine !== latest) return;
    if (!chosen) chosen = translations[0]?.id ?? "";
    content(translations, chosen, null, [status(options.strings.loading)], null);
    place();
    options.emit("tooltip-open", { reference: osis, translation: chosen });
    try {
      const passage = await options.client.passage(chosen, osis);
      if (mine !== latest) return;
      content(
        translations,
        chosen,
        passage,
        verses(passage),
        readMoreUrl(options.site, passage.translation.id, passage.label),
      );
      box.dir = passage.translation.direction;
    } catch (error) {
      if (mine !== latest) return;
      const missing =
        error instanceof ClientError &&
        (error.code === "not-in-canon" || error.code === "unknown-translation");
      content(
        translations,
        chosen,
        null,
        [status(missing ? options.strings.missing : options.strings.failed)],
        null,
      );
    }
    place();
  }

  const close = () => {
    window.clearTimeout(openTimer);
    window.clearTimeout(leaveTimer);
    latest++;
    box.hidden = true;
    anchor?.removeAttribute("aria-expanded");
    anchor = null;
  };

  const open = (link: HTMLAnchorElement) => {
    window.clearTimeout(openTimer);
    window.clearTimeout(leaveTimer);
    if (anchor === link && !box.hidden) return;
    anchor?.removeAttribute("aria-expanded");
    void show(link);
  };

  const leave = () => {
    window.clearTimeout(openTimer);
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (!inUse()) close();
    }, LEAVE_MS);
  };

  const listeners: [string, EventListener, boolean?][] = [
    [
      "pointerdown",
      (e) => {
        lastPointer = (e as PointerEvent).pointerType || "mouse";
        lastDownAt = Date.now();
        if (!linkOf(e.target) && !inside(e.composedPath()[0] ?? e.target)) close();
      },
      true,
    ],
    [
      "pointerover",
      (e) => {
        const path = e.composedPath();
        if (path.some((n) => n === host)) {
          window.clearTimeout(leaveTimer);
          return;
        }
        const link = linkOf(e.target);
        if (!link || (e as PointerEvent).pointerType !== "mouse") return;
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
        const leftLink = linkOf(from) && linkOf(from) !== linkOf(to);
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
        // The focus left a link, or the tooltip, for somewhere else.
        if ((linkOf(e.target) || inside(e.target)) && !inside(to) && !linkOf(to)) leave();
      },
    ],
    [
      "click",
      (e) => {
        const link = linkOf(e.target);
        // On a touch screen the first tap shows the passage; Read more is the way on.
        if (link && lastPointer === "touch") {
          e.preventDefault();
          if (anchor === link && !box.hidden) close();
          else open(link);
        }
      },
      true,
    ],
    [
      "keydown",
      (e) => {
        lastKeyAt = Date.now();
        if ((e as KeyboardEvent).key === "Escape" && !box.hidden) close();
      },
    ],
  ];
  for (const [type, fn, capture] of listeners) doc.addEventListener(type, fn, capture ?? false);
  const reposition = () => place();
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);

  return {
    open,
    close,
    destroy() {
      close();
      for (const [type, fn, capture] of listeners)
        doc.removeEventListener(type, fn, capture ?? false);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      host.remove();
      mark.remove();
    },
  };
}
