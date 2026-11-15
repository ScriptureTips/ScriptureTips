import { confirmDialog, modalDialog } from "@scripturetips/dialogs";
import { DEFAULT_TRANSLATION, type WidgetTranslation } from "@scripturetips/scripture-links";
import { byId, destinationOf, destinations, FORMAT_NAMES, fill } from "./pages.ts";
import {
  apiOf,
  BUILT_IN_SITE,
  LINK_FORMATS,
  type LinkFormat,
  moveOutsideSite,
  normalizeHost,
  type OutsideSite,
  PRESET_SITES,
  type Settings,
  sortedHosts,
} from "./settings.ts";
import { loadSettings, saveSettings } from "./store.ts";

/**
 * The settings page: where links go, the translation passages open in, the outside reading sites,
 * the link generator's format, the sites the extension is turned off on, and another ScriptureTips
 * installation to use. Each change is saved as it's made.
 */
let settings: Settings;
/** The list of site cards while its modal is open, else null. */
let sitesList: HTMLElement | null = null;

const status = () => byId<HTMLParagraphElement>("status");

async function save(next: Settings, redraw: boolean | number = false): Promise<void> {
  settings = next;
  if (redraw !== false) draw(typeof redraw === "number" ? redraw : -1);
  try {
    await saveSettings(next);
    status().textContent = "Saved.";
  } catch {
    // Sync storage refused it (too large, or too many writes at once).
    status().textContent = "That couldn't be saved. Try again in a moment.";
  }
}

/** The translations ScriptureTips can show, from its API; the default alone if it can't be reached. */
async function translations(): Promise<{ value: string; label: string }[]> {
  try {
    const res = await fetch(`${apiOf()}/widget/translations`, { credentials: "omit" });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { translations: WidgetTranslation[] };
    return body.translations.map((t) => ({ value: t.id, label: `${t.name} (${t.abbreviation})` }));
  } catch {
    status().textContent = "The list of translations couldn't be loaded from ScriptureTips.";
    return [{ value: DEFAULT_TRANSLATION, label: "King James Version (KJV)" }];
  }
}

/**
 * The codes the outside sites use for the common translations, for the short menu on each card
 * (a site's own code is kept in the menu too, if it isn't one of these). Empty means the link
 * names the translation the tooltip is showing.
 */
const SITE_TRANSLATIONS = [
  "KJV",
  "NKJV",
  "ESV",
  "NIV",
  "NASB",
  "NLT",
  "CSB",
  "TLV",
  "WEB",
  "ASV",
  "NET",
  "LEB",
];

/**
 * Text that is edited where it stands: a button showing it, which becomes a text box when it's
 * clicked or tapped, saves on Enter or when the focus leaves, and gives up on Escape.
 */
function editable(options: {
  value: string;
  placeholder: string;
  label: string;
  className: string;
  commit: (value: string) => void;
  startEditing?: boolean;
  /** The text box is as wide as what's in it, and grows as it's typed in. */
  grow?: boolean;
  /** The edit ended with nothing changed (or was given up). */
  cancel?: () => void;
}): HTMLElement {
  const holder = document.createElement("div");
  holder.className = options.className;
  const show = () => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "edit";
    button.title = "Click to edit";
    button.setAttribute("aria-label", `${options.label}: ${options.value || "empty"}. Edit`);
    const text = document.createElement("span");
    text.textContent = options.value || options.placeholder;
    if (!options.value) text.className = "empty";
    button.append(text);
    button.addEventListener("click", edit);
    holder.replaceChildren(button);
  };
  const edit = () => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "edit";
    input.value = options.value;
    input.placeholder = options.placeholder;
    input.spellcheck = false;
    input.setAttribute("aria-label", options.label);
    if (options.grow) {
      const fit = () => {
        input.style.width = `${Math.max(input.value.length, 6) + 1}ch`;
      };
      input.addEventListener("input", fit);
      fit();
    }
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (save && value !== options.value) {
        options.value = value;
        options.commit(value);
      } else options.cancel?.();
      if (holder.isConnected) show();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") {
        // Gives up the edit, and only that: the dialog around it stays.
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    holder.replaceChildren(input);
    input.focus();
    input.select();
  };
  show();
  // Once the card is on the page, where it can take the focus.
  if (options.startEditing) queueMicrotask(() => holder.isConnected && edit());
  return holder;
}

/** Puts the site at `from` in `to`'s place and draws the list again, the moved card's handle kept in focus. */
function reorder(from: number, to: number, refocus: boolean): void {
  if (from === to) return;
  void save(moveOutsideSite(settings, from, to), true);
  if (refocus) {
    sitesList?.querySelectorAll<HTMLElement>(".site-card .handle")[to]?.focus();
  }
}

/**
 * Makes a card sortable by its handle: dragged with a pointer (a mouse, a finger or a pen), the
 * cards make way as it passes them and it lands where it's let go; Escape puts it back. By keyboard,
 * the up and down arrows move it one place.
 */
function sortable(handle: HTMLButtonElement, card: HTMLLIElement, index: number): void {
  handle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") reorder(index, index - 1, true);
    else if (event.key === "ArrowDown") reorder(index, index + 1, true);
    else return;
    event.preventDefault();
  });
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const list = card.parentElement as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    card.classList.add("dragging");
    const move = (e: PointerEvent) => {
      const others = [...list.children].filter((c) => c !== card);
      // The card goes before the first one whose middle is below the pointer.
      const before = others.find((c) => {
        const box = c.getBoundingClientRect();
        return e.clientY < box.top + box.height / 2;
      });
      if (before) {
        if (card.nextElementSibling !== before) list.insertBefore(card, before);
        else return;
      } else if (list.lastElementChild !== card) {
        list.append(card);
      } else return;
      // Moving a node in the page lets go of the pointer it holds: take it again.
      handle.setPointerCapture(e.pointerId);
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", onEscape);
      card.classList.remove("dragging");
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      const to = [...list.children].indexOf(card);
      if (cancelled) draw();
      else reorder(index, to, false);
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Puts the drag back, and only that: the dialog around it stays.
      e.preventDefault();
      e.stopPropagation();
      end(event, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", onEscape);
  });
}

/** One outside site, as a card: its name as the title, its address, a short menu, and the delete. */
function siteCard(site: OutsideSite, index: number, startEditing: boolean): HTMLLIElement {
  const change = (key: keyof OutsideSite, value: string) => {
    const sites = settings.outsideSites.map((s, i) => (i === index ? { ...s, [key]: value } : s));
    void save({ ...settings, outsideSites: sites }, key === "name");
  };
  const card = document.createElement("li");
  card.className = "site-card";

  const main = document.createElement("div");
  main.className = "site-main";
  const title = editable({
    value: site.name,
    placeholder: "Name of the site",
    label: "Name",
    className: "site-title",
    commit: (value) => change("name", value),
    startEditing,
    grow: true,
  });
  const body = document.createElement("div");
  body.className = "site-body";
  const address = editable({
    value: site.url,
    placeholder: "https://example.org/?q=ST_REFERENCE",
    label: "Address",
    className: "site-address",
    commit: (value) => change("url", value),
  });
  const codes = document.createElement("select");
  codes.className = "site-translation";
  codes.setAttribute("aria-label", `Translation on ${site.name || "this site"}`);
  codes.title = "The site's own code for the translation";
  const known = SITE_TRANSLATIONS.includes(site.translation) ? [] : [site.translation];
  fill(
    codes,
    [
      { value: "", label: "Auto" },
      ...[...known, ...SITE_TRANSLATIONS]
        .filter((code) => code !== "")
        .map((code) => ({ value: code, label: code })),
    ],
    site.translation,
  );
  codes.addEventListener("change", () => change("translation", codes.value));
  body.append(address);
  // The menu sits right of the heading, which is only as wide as its words.
  const head = document.createElement("div");
  head.className = "site-head";
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "handle";
  handle.setAttribute(
    "aria-label",
    `Move ${site.name || "this site"}: drag, or use the up and down arrow keys`,
  );
  handle.title = "Drag to reorder";
  handle.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  sortable(handle, card, index);
  head.append(handle, title, codes);
  main.append(head, body);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.setAttribute("aria-label", `Remove ${site.name || "this site"}`);
  remove.title = "Remove";
  remove.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8"/></svg>';
  const removeSite = () => {
    const sites = settings.outsideSites.filter((_, i) => i !== index);
    const d = settings.destination;
    // The destination follows its site, or goes back to ScriptureTips if that site went.
    const destination =
      typeof d !== "number" || d === index ? "scripturetips" : d > index ? d - 1 : d;
    void save({ ...settings, outsideSites: sites, destination }, true);
  };
  // The red × asks first (a dialog, as every prompt is); Cancel is where the focus starts.
  remove.addEventListener("click", async () => {
    const name = site.name || "this site";
    const go = await confirmDialog({
      title: `Remove ${name}?`,
      message: "It will no longer be offered as a place for links to go.",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (go) removeSite();
  });
  card.append(main, remove);
  return card;
}

/** `editing`: the card at this index opens with its name ready to type (a site just added). */
function draw(editing = -1): void {
  fill(byId("destination"), destinations(settings), String(settings.destination));
  sitesList?.replaceChildren(
    ...settings.outsideSites.map((site, i) => siteCard(site, i, i === editing)),
  );
  drawDisabled();
}

/**
 * The sites the extension is turned off on, as cards (only a heading each, edited in place, the red
 * × with its confirm), always in alphabetical order. `adding`: one more card at the end, empty and
 * ready to type in; it only becomes a site if something is written.
 */
function drawDisabled(adding = false): void {
  const change = (hosts: readonly string[], redraw = true) => {
    void save({ ...settings, disabledSites: sortedHosts(hosts) }, redraw);
  };
  const card = (host: string, fresh: boolean): HTMLLIElement => {
    const li = document.createElement("li");
    li.className = "site-card";
    const main = document.createElement("div");
    main.className = "site-main";
    main.append(
      editable({
        value: host,
        placeholder: "example.org",
        label: "Site",
        className: "site-title",
        grow: true,
        startEditing: fresh,
        commit: (value) => {
          const next = normalizeHost(value);
          if (!next) return drawDisabled();
          const others = settings.disabledSites.filter((h) => h !== host);
          change([...others, next]);
        },
        cancel: () => {
          if (fresh) drawDisabled();
        },
      }),
    );
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.setAttribute("aria-label", `Remove ${host || "this site"}`);
    remove.title = "Remove";
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8"/></svg>';
    remove.addEventListener("click", async () => {
      if (fresh) return drawDisabled();
      const go = await confirmDialog({
        title: `Remove ${host}?`,
        message: "Scripture Tips will link references on this site again.",
        confirmLabel: "Remove",
        cancelLabel: "Cancel",
        danger: true,
      });
      if (go) change(settings.disabledSites.filter((h) => h !== host));
    });
    li.append(main, remove);
    return li;
  };
  byId("disabled").replaceChildren(
    ...sortedHosts(settings.disabledSites).map((h) => card(h, false)),
    ...(adding ? [card("", true)] : []),
  );
}

/** The outside reading sites, in a modal: the cards, and the buttons to add and restore. */
async function editSites(): Promise<void> {
  const content = document.createElement("div");
  content.innerHTML = `
    <p class="hint">A link's address can use <code>ST_REFERENCE</code>, <code>ST_TRANSLATION</code>, <code>ST_BOOKNAME</code>, <code>ST_CHAPTER</code> and <code>ST_VERSE</code>. The translation is that site's own code for it (such as KJV).</p>
    <ul id="sites" class="site-cards"></ul>
    <div class="row">
      <button type="button" class="quiet" id="add-site">Add a site</button>
      <button type="button" class="quiet" id="restore-sites">Restore the usual sites</button>
    </div>`;
  sitesList = content.querySelector<HTMLElement>("#sites");
  draw();
  content.querySelector("#add-site")?.addEventListener("click", () => {
    void save(
      {
        ...settings,
        outsideSites: [...settings.outsideSites, { name: "", url: "", translation: "" }],
      },
      settings.outsideSites.length,
    );
  });
  content.querySelector("#restore-sites")?.addEventListener("click", () => {
    const known = new Set(settings.outsideSites.map((s) => s.url));
    const missing = PRESET_SITES.filter((s) => !known.has(s.url));
    void save({ ...settings, outsideSites: [...settings.outsideSites, ...missing] }, true);
  });
  await modalDialog({
    title: "Outside reading sites",
    content,
    closeLabel: "Done",
    stylesheets: ["pages.css"],
    width: 640,
  });
  sitesList = null;
}

async function main() {
  settings = await loadSettings();
  draw();
  fill(
    byId("format"),
    LINK_FORMATS.map((f) => ({ value: f, label: FORMAT_NAMES[f] })),
    settings.format,
  );
  const site = byId<HTMLInputElement>("site");
  site.value = settings.site ?? "";
  site.placeholder = BUILT_IN_SITE;
  // Out of the way until it is wanted; open if another installation is already set.
  byId<HTMLDetailsElement>("advanced").open = Boolean(settings.site);

  byId<HTMLSelectElement>("destination").addEventListener("change", (e) => {
    void save({
      ...settings,
      destination: destinationOf((e.target as HTMLSelectElement).value),
    });
  });
  byId<HTMLSelectElement>("format").addEventListener("change", (e) => {
    void save({ ...settings, format: (e.target as HTMLSelectElement).value as LinkFormat });
  });
  byId<HTMLButtonElement>("add-disabled").addEventListener("click", () => drawDisabled(true));
  site.addEventListener("change", () => {
    const value = site.value.trim();
    if (value && !/^https?:\/\/[^/]+/.test(value)) {
      status().textContent = "The address needs to start with https://";
      return;
    }
    void save({ ...settings, site: value ? new URL(value).origin : null });
  });
  byId<HTMLButtonElement>("edit-sites").addEventListener("click", () => void editSites());

  const translation = byId<HTMLSelectElement>("translation");
  fill(translation, await translations(), settings.translation ?? DEFAULT_TRANSLATION);
  translation.addEventListener("change", () => {
    void save({ ...settings, translation: translation.value });
  });
}

void main();
