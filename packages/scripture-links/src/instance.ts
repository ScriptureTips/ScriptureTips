import { createChoices, pageStorage } from "./choices.ts";
import { createClient } from "./client.ts";
import { addressTranslation, destinationUrl, SCRIPTURETIPS } from "./destination.ts";
import { findInText } from "./find.ts";
import {
  AUTO_ATTRIBUTE,
  KEY_ATTRIBUTE,
  LINK_CLASS,
  linkReferences,
  REF_ATTRIBUTE,
  TEXT_ATTRIBUTE,
  unlink,
  WRITTEN_ATTRIBUTE,
} from "./scan.ts";
import { DEFAULT_STRINGS } from "./strings.ts";
import { createTooltip } from "./tooltip.ts";
import { chooseTranslation, DEFAULT_TRANSLATION } from "./translation.ts";
import type { LinksEventName, LinksEvents, LinksOptions } from "./types.ts";

/** How long a burst of page changes settles before the new parts are scanned (ms). */
const SETTLE_MS = 100;

/** What a page (or the browser extension) holds: scan, rescan, preferences, events, undo. */
export interface ScriptureLinks {
  /** Links the references inside what `selector` matches, and in what appears there later. */
  run(selector: string): void;
  /** Looks again, in one element or in every area `run` was given. */
  rescan(element?: Element): void;
  /** What the visitor prefers: the translation the tooltip opens with. */
  setPreferences(preferences: { translation?: string }): void;
  on<K extends LinksEventName>(name: K, handler: (detail: LinksEvents[K]) => void): () => void;
  /** Puts the page back as it was: every link made is replaced by its words. */
  destroy(): void;
}

/**
 * One scripture-links instance (vision §3.6): the whole of the website plugin, and what the
 * browser extension builds on. It makes no global state (several can run, each with its own
 * options and way of fetching), keeps nothing in cookies or storage, and can be undone.
 */
export function createScriptureLinks(options: LinksOptions): ScriptureLinks {
  const doc = document;
  const strings = { ...DEFAULT_STRINGS, ...options.strings };
  const site = options.site ?? new URL(options.api, location.href).origin;
  const destination = options.destination ?? SCRIPTURETIPS;
  const client = createClient({
    api: options.api,
    scheme: options.scheme ?? "kjv",
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  // The visitor's preference (the site's `setPreferences`), and the reader's own choices, which
  // are kept in the browser's storage.
  let preferred: string | undefined;
  const choices = createChoices(options.storage === undefined ? pageStorage() : options.storage);
  const handlers = new Map<LinksEventName, Set<(detail: never) => void>>();
  const links = new Set<HTMLAnchorElement>();
  const selectors: string[] = [];
  const pending = new Set<Element>();
  let settle: number | undefined;
  let observer: MutationObserver | null = null;

  const emit = <K extends LinksEventName>(name: K, detail: LinksEvents[K]) => {
    for (const handler of [...(handlers.get(name) ?? [])]) {
      // A handler that throws doesn't stop the others, or the page.
      try {
        (handler as (d: LinksEvents[K]) => void)(detail);
      } catch (error) {
        console.error(`scripture-links: a "${name}" handler threw`, error);
      }
    }
  };

  // Each link is its own: what a reader chose for one copy of a passage doesn't change another
  // copy. A choice is held for the link itself, and kept in storage under this page's path, the
  // passage, and which copy of that passage it is on the page (the first, the second …).
  const chosenHere = new WeakMap<Element, string>();
  function instanceKey(a: HTMLAnchorElement): string {
    const own = a.getAttribute(KEY_ATTRIBUTE);
    if (own) return `key|${own}`;
    const osis = a.getAttribute(REF_ATTRIBUTE) ?? "";
    const copies = [...doc.querySelectorAll<HTMLAnchorElement>(`a.${LINK_CLASS}`)].filter(
      (other) => other.getAttribute(REF_ATTRIBUTE) === osis,
    );
    return `${location.pathname}|${osis}|${copies.indexOf(a)}`;
  }
  const chosenFor = (a: HTMLAnchorElement): string | undefined =>
    chosenHere.get(a) ?? choices.get(instanceKey(a));

  /** The translation a link's address names, if the page wrote it (a link of the plugin's own doesn't count). */
  function linkedTranslation(a: HTMLAnchorElement): string | undefined {
    if (a.hasAttribute(AUTO_ATTRIBUTE)) return undefined;
    try {
      return new URL(a.href, doc.baseURI).searchParams.get("t") ?? undefined;
    } catch {
      return undefined;
    }
  }

  const tooltip = createTooltip(doc, {
    client,
    strings,
    site,
    hoverDelayMs: options.hoverDelayMs ?? 300,
    translation: async (a) =>
      chooseTranslation(
        {
          chosen: chosenFor(a),
          linked: linkedTranslation(a),
          written: a.getAttribute(WRITTEN_ATTRIBUTE) ?? undefined,
          preferred,
          configured: options.translation,
        },
        await client.translations(),
      ),
    choose: (a, translation) => {
      chosenHere.set(a, translation);
      choices.set(instanceKey(a), translation);
      refreshAddress(a);
    },
    emit,
    owner: options.owner,
  });

  const scanOptions = {
    destination,
    site,
    // What a new link's address names: the visitor's preference or the configured default.
    // (A link's own choice is applied once it's in the page: `refreshAddress`.)
    translation: () =>
      addressTranslation(
        destination,
        options.destinationTranslation,
        preferred ?? options.translation ?? DEFAULT_TRANSLATION,
      ),
    ignore: options.ignore,
    owner: options.owner,
  };

  /** A link of the plugin's names in its address the translation it will open in. */
  function refreshAddress(a: HTMLAnchorElement): void {
    if (!links.has(a) || !a.hasAttribute(AUTO_ATTRIBUTE)) return;
    const ref = findInText(a.getAttribute(TEXT_ATTRIBUTE) ?? "")[0];
    if (!ref) return;
    const chosen = chosenFor(a);
    const translation = chosen
      ? addressTranslation(destination, options.destinationTranslation, chosen)
      : scanOptions.translation();
    a.href = destinationUrl(destination, site, translation, ref);
  }

  /** The same for every link: after the visitor's preference changes. */
  function refreshAddresses(): void {
    for (const a of links) refreshAddress(a);
  }

  const roots = (): Element[] => selectors.flatMap((s) => [...doc.querySelectorAll(s)]);

  function scan(element: Element): void {
    const made = linkReferences(element, scanOptions);
    for (const a of made) links.add(a);
    // Choices kept from before name their translation in the new links' addresses.
    for (const a of made) refreshAddress(a);
    // What the scan changed isn't news to the observer below.
    observer?.takeRecords();
    if (made.length > 0) emit("scan", { linked: made.length });
  }

  /** Where something added to the page falls under the areas being scanned. */
  function note(node: Node): void {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el || el.closest(".st-host") || el.matches("a.st-ref")) return;
    for (const s of selectors) {
      if (el.closest(s)) pending.add(el);
      else for (const inner of el.querySelectorAll(s)) pending.add(inner);
    }
  }

  function watch(): void {
    if (observer) return;
    observer = new MutationObserver((records) => {
      for (const record of records) for (const added of record.addedNodes) note(added);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const batch = [...pending];
        pending.clear();
        for (const el of batch) if (el.isConnected) scan(el);
      }, SETTLE_MS);
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  return {
    run(selector) {
      selectors.push(selector);
      for (const root of doc.querySelectorAll(selector)) scan(root);
      watch();
    },
    rescan(element) {
      for (const root of element ? [element] : roots()) scan(root);
    },
    setPreferences(preferences) {
      if (preferences.translation !== undefined) {
        preferred = preferences.translation;
        refreshAddresses();
      }
    },
    on(name, handler) {
      const set = handlers.get(name) ?? new Set();
      set.add(handler as (detail: never) => void);
      handlers.set(name, set);
      return () => set.delete(handler as (detail: never) => void);
    },
    destroy() {
      window.clearTimeout(settle);
      observer?.disconnect();
      observer = null;
      tooltip.destroy();
      unlink(links);
      links.clear();
      pending.clear();
      handlers.clear();
      selectors.length = 0;
    },
  };
}
