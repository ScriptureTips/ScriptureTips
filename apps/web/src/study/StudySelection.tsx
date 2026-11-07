"use client";

import { getSearch } from "@scripturetips/search";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { errorCode, useErrorText } from "../compilations/errors.ts";
import { useHydrated } from "../hydrated.ts";
import { type Anchor, linksAt, readAnchor } from "./linkAnchor.ts";
import { openStudyMenu } from "./menuBus.ts";
import { LINKS_CHANGED } from "./StudyLinkMarks.tsx";
import { useStudy } from "./StudyProvider.tsx";
import { STUDY_SEARCH } from "./StudySearch.tsx";
import {
  dropHeldSelection,
  holdSelection,
  justReleased,
  noteDismissal,
  readPick,
  SCOPE,
  type StudyPick,
} from "./selection.ts";

/** apps/api `StudyLemma`: a word in full. */
interface Lemma {
  occurrences: number;
  entries: { lexicon: string; name: string; headword: string | null; summary: string }[];
}

/** apps/api `LinkView`: a link of the user's, seen from the selected passage. */
interface ScriptureLink {
  id: string;
  quote: string | null;
  anchor: Anchor | null;
  other: { osis: string; label: string };
  end: "source" | "target";
}

/** Mouse down in the tooltip keeps the selection, except in its text field, which takes the focus. */
const keepSelection = (e: { target: EventTarget; preventDefault: () => void }) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
};

/** The most characters of selected words a link keeps (apps/api `MAX_QUOTE`). */
const MAX_QUOTE = 500;

/** The most words the tooltip lists; a long selection says how many more. */
const MOST = 6;
/** The tooltip's width, for keeping it in the window. */
const WIDTH = 360;

/**
 * Study mode's tooltip: when the mouse is let go after selecting text in the compare view (or
 * a word is double-clicked), it opens by the selection with the marked words in it, each with its
 * Hebrew or Greek word, its number, how often it's used and what the dictionaries say. It closes
 * on Escape, a click elsewhere, or when the selection goes. Clicking in it keeps the selection.
 * A click on words a link is pinned to selects them and opens it, listing the links pinned there.
 */
export function StudySelection({ slug }: { slug: string }) {
  const words = useStudy();
  const t = useTranslations("study");
  const errorText = useErrorText();
  const hydrated = useHydrated();
  const tip = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<StudyPick | null>(null);
  // Whether it's open, for the mouse handlers (which are set up once).
  const open = useRef(false);
  open.current = picked !== null;
  const [lemmas, setLemmas] = useState<Record<string, Lemma | null>>({});
  // Whether the last press was a finger, and one is on the tooltip: a finger's selection has no
  // mouse up to follow, and tapping the tooltip mustn't be taken for the selection going.
  const touching = useRef(false);
  const tipPressed = useRef(false);
  const settle = useRef<number | undefined>(undefined);
  const asked = useRef(new Set<string>());
  const [, moved] = useState(0);
  // The selection whose words are explained in the bar (a new selection starts closed).
  const [explained, setExplained] = useState<StudyPick | null>(null);
  // The selection whose link form is open (a new selection starts closed), what's typed in it,
  // and why the last try failed.
  const [linking, setLinking] = useState<StudyPick | null>(null);
  const [typed, setTyped] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // The links pinned to the words that were clicked, when the selection is a click on words a
  // link is pinned to: only those are listed. Null for any other selection.
  const only = useRef<string[] | null>(null);
  // Whether the form is open, for the selection handler: focusing its field lets the browser's
  // selection go, which mustn't close the tooltip. (The words are held for it.)
  const linkOpen = useRef(false);
  linkOpen.current = picked !== null && linking === picked;
  // The user's links with the selected verses at either end; null when there are none to show
  // (signed out, or the verses can't be told).
  const [links, setLinks] = useState<{ source: string; list: ScriptureLink[] } | null>(null);

  useEffect(() => {
    const inTip = (e: Event) => e.target instanceof Node && tip.current?.contains(e.target);
    // After the browser has finished the selection (a double click selects its word on mouse up).
    const up = (e: MouseEvent) => {
      if (inTip(e)) return;
      only.current = null;
      // A click on words a link is pinned to selects them, as if they had been selected by hand.
      // It's done now, so the click this ends sees a selection (`ignoresClick`).
      const selection = window.getSelection();
      if (selection?.isCollapsed && inText(e)) {
        const hit = linksAt(e.clientX, e.clientY);
        if (hit) {
          only.current = hit.ids;
          selection.removeAllRanges();
          selection.addRange(hit.range.cloneRange());
        }
      }
      window.setTimeout(() => {
        const pick = readPick();
        // Other words selected replace the held ones.
        if (pick) dropHeldSelection();
        setPicked(pick);
      }, 0);
    };
    const inText = (e: Event) => e.target instanceof Element && e.target.closest(SCOPE) !== null;
    // A press outside it closes it, and the click that press ends isn't a choice of the verse.
    const down = (e: MouseEvent) => {
      if (inTip(e)) return;
      // Pressing on the text again ends the held selection.
      if (inText(e)) dropHeldSelection();
      only.current = null;
      if (open.current) {
        noteDismissal();
        // Clicking a button doesn't clear the selection: without this, letting go would find
        // the old one and open the tooltip again.
        window.getSelection()?.removeAllRanges();
      }
      setPicked(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dropHeldSelection();
      setPicked(null);
    };
    const change = () => {
      // The browser's selection let go by `holdSelection` isn't the user clearing it.
      if (justReleased() || linkOpen.current) return;
      if (window.getSelection()?.isCollapsed) {
        window.clearTimeout(settle.current);
        if (tipPressed.current) return;
        // A tap that clears the selection closes the tooltip, and isn't a choice of what's tapped.
        if (open.current && touching.current) noteDismissal();
        setPicked(null);
      } else if (touching.current) {
        // A long press selects a word, and its handles stretch it: the tooltip opens when the
        // selection has stopped changing.
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => {
          const pick = readPick();
          if (pick) dropHeldSelection();
          setPicked(pick);
        }, 400);
      }
    };
    const press = (e: PointerEvent) => {
      touching.current = e.pointerType === "touch";
      tipPressed.current = inTip(e) === true;
      if (!tipPressed.current && inText(e)) dropHeldSelection();
    };
    const lift = () => {
      window.setTimeout(() => {
        tipPressed.current = false;
      }, 300);
    };
    document.addEventListener("mouseup", up);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    document.addEventListener("selectionchange", change);
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("pointerup", lift, true);
    document.addEventListener("pointercancel", lift, true);
    return () => {
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("pointerup", lift, true);
      document.removeEventListener("pointercancel", lift, true);
      window.clearTimeout(settle.current);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      document.removeEventListener("selectionchange", change);
    };
  }, []);

  // Stays by the selection while the page scrolls or the window changes size.
  useEffect(() => {
    if (!picked) return;
    const again = () => moved((n) => n + 1);
    window.addEventListener("scroll", again, true);
    window.addEventListener("resize", again);
    return () => {
      window.removeEventListener("scroll", again, true);
      window.removeEventListener("resize", again);
    };
  }, [picked]);

  // Each listed word's full entry, asked for once.
  useEffect(() => {
    for (const strong of picked?.strongs.slice(0, MOST) ?? []) {
      if (asked.current.has(strong)) continue;
      asked.current.add(strong);
      fetch(`/api/study/lemma/${strong}`)
        .then((res) => (res.ok ? (res.json() as Promise<Lemma>) : null))
        .catch(() => null)
        .then((lemma) => setLemmas((all) => ({ ...all, [strong]: lemma })));
    }
  }, [picked]);

  // The links on the selected verses, asked for each time the tooltip opens on them. Signed out,
  // the API says so and the tooltip has no links to show or make.
  const source = picked?.source ?? null;
  useEffect(() => {
    setLinks(null);
    if (!source) return;
    let current = true;
    fetch(`/api/links?ref=${encodeURIComponent(source)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ links: ScriptureLink[] }>) : null))
      .catch(() => null)
      .then((found) => {
        if (current && found) setLinks({ source, list: found.links });
      });
    return () => {
      current = false;
    };
  }, [source]);

  // The form's field has the focus once it opens.
  const formOpen = linking !== null && linking === picked;
  useEffect(() => {
    if (formOpen) field.current?.focus();
  }, [formOpen]);

  if (!picked || !words) return null;
  // On a touch screen the phone draws its own menu over the selection (and handles under it), so
  // the actions are a bar along the bottom of the screen instead, clear of both.
  const bar = window.matchMedia("(pointer: coarse)").matches;
  const rect = picked.range.getBoundingClientRect();
  // While the selection is scrolled out of sight, so is the tooltip (it's back when the selection is).
  if (!bar && (rect.bottom < 0 || rect.top > window.innerHeight)) return null;
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - WIDTH - 8));
  // On the side of the selection with more room, and no taller than that room: its buttons stay
  // on screen, and the words inside scroll.
  const room = { below: window.innerHeight - rect.bottom - 16, above: rect.top - 16 };
  const above = room.below < 260 && room.above > room.below;
  const maxHeight = Math.max(140, above ? room.above : room.below);
  const place = above
    ? { left, bottom: window.innerHeight - rect.top + 8, maxHeight }
    : { left, top: rect.bottom + 8, maxHeight };
  const canLink = links !== null && picked.source !== null;
  const shownLinks = (links?.list ?? []).filter(
    (l) => !only.current || only.current.includes(l.id),
  );
  const listed = picked.strongs.slice(0, MOST);
  const text = picked.text.length > 120 ? `${picked.text.slice(0, 120)}…` : picked.text;

  const wordList = (
    <>
      <p className="study-tip-text">{`“${text}”`}</p>
      {listed.length === 0 ? (
        <p className="study-tip-empty">{t("tip.none")}</p>
      ) : (
        <ul className="study-tip-words">
          {listed.map((strong) => (
            <WordCard key={strong} strong={strong} lemma={lemmas[strong]} />
          ))}
        </ul>
      )}
      {picked.strongs.length > MOST ? (
        <p className="study-tip-empty">{t("tip.more", { count: picked.strongs.length - MOST })}</p>
      ) : null}
    </>
  );

  // The links on the words, and why the last try at one failed. On a phone they show without
  // asking for the words to be explained.
  const linkList = (
    <>
      {shownLinks.length > 0 ? (
        <ul className="study-tip-links" aria-label={t("tip.links")}>
          {shownLinks.map((link) => (
            <li key={link.id}>
              <span aria-hidden="true">{link.end === "source" ? "→" : "←"}</span>{" "}
              {link.end === "source" ? <Quote text={link.quote} /> : null}
              <span>{link.other.label}</span>
              {link.end === "target" ? <Quote text={link.quote} /> : null}
              <button
                type="button"
                className="study-tip-remove"
                aria-label={t("tip.unlink", { passage: link.other.label })}
                onClick={() => {
                  void fetch(`/api/links/${link.id}`, { method: "DELETE" }).then((res) => {
                    if (!res.ok) return;
                    setLinks((now) =>
                      now ? { ...now, list: now.list.filter((l) => l.id !== link.id) } : now,
                    );
                    window.dispatchEvent(new Event(LINKS_CHANGED));
                  });
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {linkError ? (
        <p className="error" role="alert">
          {linkError}
        </p>
      ) : null}
    </>
  );

  const explanation = (
    <div className="study-tip-body">
      {wordList}
      {linkList}
    </div>
  );

  const addLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!picked.source || !typed.trim() || adding) return;
    setAdding(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          compilation: slug,
          source: picked.source,
          target: typed.trim(),
          quote: picked.text.slice(0, MAX_QUOTE),
          // The words are pinned only if the whole quote is kept.
          anchor: pinned(picked, slug),
        }),
      });
      if (!res.ok) {
        setLinkError(errorText(await errorCode(res)));
        return;
      }
      const made = (await res.json()) as ScriptureLink;
      if (only.current) only.current = [...only.current, made.id];
      setLinks((now) => ({ source: picked.source ?? "", list: [made, ...(now?.list ?? [])] }));
      window.dispatchEvent(new Event(LINKS_CHANGED));
      setTyped("");
      setLinking(null);
    } catch {
      setLinkError(errorText("unavailable"));
    } finally {
      setAdding(false);
    }
  };

  const actions = formOpen ? (
    <form className="study-tip-actions study-tip-link" onSubmit={addLink}>
      <input
        ref={field}
        type="text"
        className="study-tip-field"
        aria-label={t("tip.linkTo")}
        placeholder={t("tip.linkPlaceholder")}
        value={typed}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => setTyped(e.target.value)}
      />
      <button
        type="submit"
        className="study-tip-button"
        disabled={!hydrated || adding || !typed.trim()}
      >
        {t("tip.addLink")}
      </button>
      <button
        type="button"
        className="study-tip-button"
        onClick={() => {
          setLinking(null);
          setLinkError(null);
        }}
      >
        {t("tip.cancel")}
      </button>
    </form>
  ) : (
    <div className="study-tip-actions">
      {bar ? (
        <button
          type="button"
          className="study-tip-button"
          aria-expanded={explained === picked}
          onClick={() => {
            setExplained(explained === picked ? null : picked);
            // The phone's selection handles are drawn over everything, the bar included: the
            // words stay held (as a highlight) and the browser's selection is let go.
            holdSelection(picked);
          }}
        >
          {t("tip.explain")}
        </button>
      ) : null}
      <button
        type="button"
        className="study-tip-button"
        onClick={() => {
          // The window opens, and gets the words and searches them.
          openStudyMenu();
          void getSearch(STUDY_SEARCH).setQuery(picked.text.slice(0, 200), { search: true });
          // The words have been sent. They stay held (drawn as a highlight, ready for whatever
          // works on them next) and the browser's selection goes, so a phone's handles and
          // toolbar, which it draws over everything, don't show through the window.
          holdSelection(picked);
          setPicked(null);
        }}
      >
        {t("tip.search")}
      </button>
      <CopyButton text={picked.text} />
      {canLink ? (
        <button
          type="button"
          className="study-tip-button"
          onClick={() => {
            // Typing in the field lets the browser's selection go: the words are held instead.
            holdSelection(picked);
            setLinkError(null);
            setLinking(picked);
          }}
        >
          {t("tip.link")}
        </button>
      ) : null}
    </div>
  );

  if (bar) {
    return createPortal(
      // Quick actions on the selected words; more are added here as they're built.
      // biome-ignore lint/a11y/noStaticElementInteractions: it only keeps the selection from clearing.
      <div
        ref={tip}
        role="toolbar"
        aria-label={t("tip.label")}
        className="study-tip study-tip-bar"
        onMouseDown={keepSelection}
      >
        {explained === picked || formOpen ? (
          explanation
        ) : shownLinks.length > 0 ? (
          <div className="study-tip-body">{linkList}</div>
        ) : null}
        {actions}
      </div>,
      document.body,
    );
  }

  return createPortal(
    // Mouse down in the tooltip keeps the selection (and so the tooltip).
    // biome-ignore lint/a11y/noStaticElementInteractions: it only keeps the selection from clearing.
    <div
      ref={tip}
      role="dialog"
      aria-label={t("tip.label")}
      className="study-tip"
      style={place}
      onMouseDown={keepSelection}
    >
      {explanation}
      {actions}
    </div>,
    document.body,
  );
}

/** The words, quoted, as a link keeps them. */
function Quote({ text }: { text: string | null }) {
  return text ? <q className="study-tip-quote">{text}</q> : null;
}

/** Where the selected words are pinned, if there's one wording to pin them to. */
function pinned(pick: StudyPick, slug: string): Anchor | undefined {
  if (pick.text.length > MAX_QUOTE) return undefined;
  const node = pick.range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const scope = element?.closest(SCOPE);
  return (scope && readAnchor(scope, pick.range, slug)) || undefined;
}

function WordCard({ strong, lemma }: { strong: string; lemma: Lemma | null | undefined }) {
  const words = useStudy();
  const t = useTranslations("study");
  const [open, setOpen] = useState(false);
  const word = words?.[strong];
  if (!word) return null;
  const hebrew = strong.startsWith("H");
  return (
    <li className="study-tip-word">
      <div className="study-tip-head">
        <span className="study-word" data-category={word.category}>
          <span lang={hebrew ? "he" : "grc"} dir={hebrew ? "rtl" : "ltr"}>
            {word.headword ?? strong}
          </span>
        </span>
        <span className="study-tip-number">{strong}</span>
        <span className="study-tip-kind">{t(`category.${word.category}`)}</span>
      </div>
      {word.gloss ? <p className="study-tip-gloss">{word.gloss}</p> : null}
      {lemma ? (
        <p className="study-tip-used">{t("tip.used", { count: lemma.occurrences })}</p>
      ) : null}
      {lemma && lemma.entries.length > 0 ? (
        <>
          <button
            type="button"
            className="study-tip-button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {t("tip.dictionary")}
          </button>
          {open ? (
            <dl className="study-tip-entries">
              {lemma.entries.map((e) => (
                <div key={e.lexicon}>
                  <dt>{e.name}</dt>
                  <dd>{e.summary}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function CopyButton({ text }: { text: string }) {
  const t = useTranslations("study");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="study-tip-button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? t("tip.copied") : t("tip.copy")}
    </button>
  );
}
