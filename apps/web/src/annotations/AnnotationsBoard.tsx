"use client";

import { choiceDialog, confirmDialog } from "@scripturetips/dialogs";
import { useTranslations } from "next-intl";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { errorCode, useErrorText } from "../compilations/errors.ts";
import { useHydrated } from "../hydrated.ts";
import { COLLECTIONS_CHANGED, type Collection, NOTES_CHANGED } from "../study/yourNotes.ts";
import { Toast } from "../ui/Toast.tsx";
import { AddModal } from "./AddModal.tsx";
import { EditModal } from "./EditModal.tsx";
import { type Item, type Wording, wordingName } from "./items.ts";
import { NewCollectionModal } from "./NewCollectionModal.tsx";
import { PassageLink, PassageTips } from "./PassageTips.tsx";
import { send } from "./requests.ts";
import { TranslationModal } from "./TranslationModal.tsx";

interface Sets {
  collections: Collection[];
  /** How many are in the default collection (in no other), and in all. */
  unsorted: number;
  total: number;
}

interface List {
  items: Item[];
  more: boolean;
}

/**
 * An item on its way to another collection, to be copied or linked there: dragged by its handle,
 * or picked (its handle pressed, then a collection chosen: the way without dragging).
 */
interface Carried {
  item: Item;
  from: string;
  by: "drag" | "pick";
}

/** The attribute naming the collection a drop lands in (`default`, or a collection's ID). */
const DROP = "data-drop-collection";

/** The collection whose box is at a point on the screen, if any. */
const dropAt = (x: number, y: number): string | null =>
  document.elementFromPoint(x, y)?.closest(`[${DROP}]`)?.getAttribute(DROP) ?? null;

/** The next click anywhere is swallowed (the one a drag's release makes). */
function swallowClick(): void {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

/**
 * The annotations page (vision §3.7.2): each collection (the default one first) a box that opens
 * to a scrolling list of its links and annotations, one line each. A line opens the item to edit it
 * (`EditModal`); its trash icon takes it out of that collection (deleting it, once confirmed, from
 * its last one); and the abbreviation of the wording its words are in opens its translation
 * (`TranslationModal`: its verse in full, and a move or copy to another wording). Its handle,
 * dragged onto another collection (the boxes close to their headings while it's carried), copies,
 * links or moves it there, as the user chooses in the prompt that follows; pressed instead of
 * dragged, it's carried until a collection is chosen. An open collection's Add makes a new one in
 * it (`AddModal`). Its passages (on its line and in its modals) show their text in the website
 * plugin's tooltip (`PassageTips`), each in the translation its words are in. *+ New collection*,
 * above the first collection's top right, makes a collection (`NewCollectionModal`: its title and
 * description).
 */
export function AnnotationsBoard({
  compilations,
  translations,
}: {
  compilations: readonly { slug: string; abbreviation: string; title: string; base: string }[];
  translations: readonly { id: string; abbreviation: string; name: string }[];
}) {
  const t = useTranslations("annotations");
  const errorText = useErrorText();
  const hydrated = useHydrated();
  const [sets, setSets] = useState<Sets | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [lists, setLists] = useState<Record<string, List>>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item: Item; from: string } | null>(null);
  const [translating, setTranslating] = useState<Item | null>(null);
  const [carried, setCarried] = useState<Carried | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const banner = useRef<HTMLParagraphElement>(null);

  // The boxes open now, and the latest request for each list: an answer is used only if it's the
  // latest asked for that list (a reload can come back after a later one).
  const openNow = useRef(open);
  useEffect(() => {
    openNow.current = open;
  }, [open]);
  const asked = useRef<Record<string, number>>({});
  const askedSets = useRef(0);
  // Each carry's number: one put down (Escape, a drop) is over, whatever its pointer does next.
  const carry = useRef(0);

  const loadSets = useCallback(async () => {
    const n = ++askedSets.current;
    const res = await fetch("/api/collections").catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as Sets;
    if (n === askedSets.current) setSets(body);
  }, []);
  const loadList = useCallback(async (key: string, from: number) => {
    const n = (asked.current[key] ?? 0) + 1;
    asked.current[key] = n;
    const res = await fetch(
      `/api/collections/items?in=${encodeURIComponent(key)}&from=${from}`,
    ).catch(() => null);
    if (!res || asked.current[key] !== n) return;
    if (!res.ok) {
      // A collection deleted elsewhere.
      if (res.status === 404) setOpen((was) => new Set([...was].filter((k) => k !== key)));
      return;
    }
    const body = (await res.json()) as List;
    if (asked.current[key] !== n) return;
    setLists((was) => ({
      ...was,
      [key]: {
        items: from === 0 ? body.items : [...(was[key]?.items ?? []), ...body.items],
        more: body.more,
      },
    }));
  }, []);
  /** The counts again, and the lists open now (one closed is fetched again when it's opened). */
  const reload = useCallback(async () => {
    await Promise.all([loadSets(), ...[...openNow.current].map((k) => loadList(k, 0))]);
  }, [loadSets, loadList]);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  const openBox = (key: string) => {
    openNow.current = new Set([...openNow.current, key]);
    setOpen(openNow.current);
    void loadList(key, 0);
  };
  const toggle = (key: string) => {
    if (!open.has(key)) openBox(key);
    else setOpen(new Set([...open].filter((k) => k !== key)));
  };

  /**
   * Something changed: study mode is told (other tabs on their next load), the lists reload, and
   * then it's said (so what's said is what's shown).
   */
  const done = async (said: string, changed: string = NOTES_CHANGED) => {
    window.dispatchEvent(new Event(changed));
    setError(null);
    await reload();
    setStatus(said);
  };
  const act = async (
    request: () => Promise<Response>,
    said: string,
    changed?: string,
  ): Promise<boolean> => {
    setError(null);
    setStatus(null);
    try {
      const res = await request();
      if (!res.ok) {
        setError(errorText(await errorCode(res)));
        return false;
      }
      await done(said, changed);
      return true;
    } catch {
      setError(errorText("unavailable"));
      return false;
    }
  };

  /**
   * The trash icon on an item's line in a collection: it's taken out of that collection, and stays
   * in the others it's in; in no other, it's deleted, once the user confirms. Asked not to delete
   * one this page thinks is in another collection too, the API refuses if that's no longer so.
   */
  const trashItem = async (item: Item, from: string, fromTitle: string) => {
    const stays = from !== "default" && item.collections.some((c) => c !== from);
    if (!stays) {
      const isLink = item.kind === "link";
      const sure = await confirmDialog({
        title: isLink ? t("deleteLinkTitle") : t("deleteAnnotationTitle"),
        message: t(isLink ? "deleteLinkMessage" : "deleteAnnotationMessage", {
          item: lineText(item),
        }),
        confirmLabel: t("delete"),
        cancelLabel: t("cancel"),
        danger: true,
      });
      if (!sure) return;
    }
    setError(null);
    setStatus(null);
    try {
      const res = await send(
        `/api/collections/items/${item.kind}/${item.id}?from=${encodeURIComponent(from)}${stays ? "&keep=true" : ""}`,
        "DELETE",
      );
      if (!res.ok) {
        setError(errorText(await errorCode(res)));
        await reload();
        return;
      }
      const { deleted } = (await res.json()) as { deleted: boolean };
      await done(
        deleted
          ? t("deleted")
          : from === "default"
            ? t("stillCollected")
            : t("removed", { collection: fromTitle }),
      );
    } catch {
      setError(errorText("unavailable"));
    }
  };

  const collections = sets?.collections ?? [];
  const nameOf = (to: string) =>
    to === "default" ? t("defaultCollection") : (collections.find((c) => c.id === to)?.title ?? "");

  /**
   * Copies, links or moves an item from one collection into another, as the user chooses (or
   * none). The default collection holds what's in no other: an item there can't be linked into
   * another as well (only moved there), and one goes into it only as a copy, or moved there out
   * of its only collection. Nor is an item linked or moved into a collection it's in already.
   */
  const drop = async (item: Item, from: string, to: string) => {
    const name = nameOf(to);
    const already = to !== "default" && item.collections.includes(to);
    const linkable = from !== "default" && to !== "default" && !already;
    const movable =
      to !== from &&
      (to === "default" ? item.collections.length === 1 && item.collections[0] === from : !already);
    const choice = await choiceDialog<"copy" | "link" | "move">({
      title: t(linkable ? "dropTitle" : movable ? "dropMoveTitle" : "dropCopyTitle", {
        collection: name,
      }),
      message:
        linkable || movable
          ? ""
          : to === "default"
            ? t("dropDefault")
            : t("dropAlready", { collection: name }),
      choices: [
        { value: "copy", label: t("copy"), description: t("copyMeans", { collection: name }) },
        ...(linkable
          ? [
              {
                value: "link" as const,
                label: t("link"),
                description: t("linkMeans", { collection: name }),
              },
            ]
          : []),
        ...(movable
          ? [
              {
                value: "move" as const,
                label: t("move"),
                description: t("moveMeans", { from: nameOf(from), collection: name }),
              },
            ]
          : []),
      ],
      cancelLabel: t("cancel"),
    });
    if (choice === "copy")
      await act(
        () =>
          send(`/api/collections/items/${item.kind}/${item.id}/copies`, "POST", {
            collections: to === "default" ? [] : [to],
          }),
        t("copied"),
      );
    else if (choice === "link")
      await act(
        () =>
          send(`/api/collections/items/${item.kind}/${item.id}`, "PUT", {
            collections: [...item.collections, to],
          }),
        t("linked"),
      );
    else if (choice === "move")
      await act(
        () =>
          send(`/api/collections/items/${item.kind}/${item.id}`, "PUT", {
            collections: [
              ...item.collections.filter((c) => c !== from),
              ...(to === "default" ? [] : [to]),
            ],
          }),
        t("moved"),
      );
  };

  const putDown = useCallback(() => {
    carry.current++;
    setCarried(null);
    setPointer(null);
    setOver(null);
  }, []);

  /** The handle pressed: moved far enough, it's a drag (its release drops it on a collection). */
  const press = (item: Item, from: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || carried) return;
    // No text selection, and no scrolling on a touch screen (the handle's `touch-action`).
    e.preventDefault();
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const mine = ++carry.current;
    let dragging = false;
    // On the window: the handle goes when the boxes close.
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (carry.current !== mine) return stop();
      if (!dragging) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        dragging = true;
        setCarried({ item, from, by: "drag" });
      }
      setPointer({ x: ev.clientX, y: ev.clientY });
      setOver(dropAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      if (!dragging || carry.current !== mine) return;
      swallowClick();
      const to = dropAt(ev.clientX, ev.clientY);
      putDown();
      // After the release's click (swallowed), so the prompt isn't answered by it.
      if (to) window.setTimeout(() => void drop(item, from, to), 0);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      if (dragging && carry.current === mine) putDown();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  useEffect(() => {
    if (!carried) return;
    if (carried.by === "pick") banner.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      putDown();
    };
    window.addEventListener("keydown", key);
    document.body.classList.toggle("annotation-dragging", carried.by === "drag");
    return () => {
      window.removeEventListener("keydown", key);
      document.body.classList.remove("annotation-dragging");
    };
  }, [carried, putDown]);

  const wordings: Wording[] = [
    ...translations.map((tr) => ({ in: tr.id, compilation: "", label: tr.abbreviation })),
    ...compilations.map((c) => ({
      in: "@compilation",
      compilation: c.slug,
      label: t("ownWording", { abbreviation: c.abbreviation }),
    })),
  ];
  /**
   * Where a link not pinned to words is read: the first compilation's own wording (where its
   * target is typed, and where its translation opens), if the user has a compilation.
   */
  const unpinnedIn =
    wordings.find((w) => w.in === "@compilation" && w.compilation === compilations[0]?.slug) ??
    null;
  /** The wording an item's words are in (unpinned: where it's read), short, for its line. */
  const shortWording = (item: Item): string | null => {
    const a = item.anchor;
    if (!a) return compilations[0]?.abbreviation ?? null;
    if (a.in !== "@compilation")
      return translations.find((tr) => tr.id === a.in)?.abbreviation ?? a.in;
    return (
      compilations.find((c) => c.slug === a.compilation.toLowerCase())?.abbreviation ??
      a.compilation
    );
  };
  // The translation a wording reads its references in (a compilation's own wording: its base),
  // and one for a link not pinned to words (the first compilation's base).
  const fallback = compilations[0]?.base ?? translations[0]?.id ?? "";
  const readIn = (w: { in: string; compilation?: string }) =>
    w.in === "@compilation"
      ? (compilations.find((c) => c.slug === w.compilation?.toLowerCase())?.base ?? fallback)
      : w.in;
  const tipsIn = (item: Item) => (item.anchor ? readIn(item.anchor) : fallback);
  const boxes = [
    { key: "default", title: t("defaultCollection"), count: sets?.unsorted ?? 0, own: false },
    ...collections.map((c) => ({ key: c.id, title: c.title, count: c.count, own: true })),
  ];

  return (
    <div className="annotations-page annotations-board">
      {/*
       * Made again when an item's modal opens or closes: a tooltip pinned in the modal goes with
       * it (its host was in the dialog, and would come back with the next tooltip shown).
       */}
      <PassageTips key={editing ? "modal" : "page"} translation={fallback} />
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <p>
        {t.rich("introDrag", {
          handle: () => (
            <span className="annotation-handle-icon" aria-hidden="true">
              ⠿
            </span>
          ),
        })}
      </p>
      <p>{t("introEdit")}</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <Toast message={status} onDone={() => setStatus(null)} />
      {carried?.by === "pick" ? (
        <div className="annotation-picking">
          <p ref={banner} tabIndex={-1}>
            {t("picking", { item: lineText(carried.item) })}
          </p>
          <button type="button" className="action-button secondary" onClick={putDown}>
            {t("cancel")}
          </button>
        </div>
      ) : null}

      <div className="annotation-boxes-head">
        <button
          type="button"
          className="action-button"
          disabled={!hydrated}
          onClick={() => setMaking(true)}
        >
          <span aria-hidden="true">+ </span>
          {t("newCollection")}
        </button>
      </div>
      <div className="annotation-boxes">
        {boxes.map((b) => (
          <CollectionBox
            key={b.key}
            id={b.key}
            title={b.title}
            count={b.count}
            own={b.own}
            expanded={!carried && open.has(b.key)}
            list={lists[b.key]}
            carrying={carried !== null}
            over={over === b.key}
            hydrated={hydrated}
            shortWording={shortWording}
            tipsIn={tipsIn}
            onToggle={() => toggle(b.key)}
            onDrop={() => {
              const was = carried;
              putDown();
              if (was) void drop(was.item, was.from, b.key);
            }}
            onAdd={() => setAdding(b.key)}
            onMore={() => void loadList(b.key, lists[b.key]?.items.length ?? 0)}
            onOpen={(item) => setEditing({ item, from: b.key })}
            onTranslate={setTranslating}
            onTrash={(item) => void trashItem(item, b.key, b.title)}
            onPress={(item, e) => press(item, b.key, e)}
            onPick={(item) => {
              if (!carried) setCarried({ item, from: b.key, by: "pick" });
            }}
            onRename={(next) =>
              act(
                () => send(`/api/collections/${b.key}`, "PATCH", { title: next }),
                t("saved"),
                COLLECTIONS_CHANGED,
              )
            }
            onDelete={async () => {
              const sure = await confirmDialog({
                title: t("deleteCollectionTitle"),
                message: t("deleteCollectionMessage", { title: b.title }),
                confirmLabel: t("delete"),
                cancelLabel: t("cancel"),
                danger: true,
              });
              if (!sure) return;
              setOpen(new Set([...open].filter((k) => k !== b.key)));
              await act(
                () => send(`/api/collections/${b.key}`, "DELETE"),
                t("deleted"),
                COLLECTIONS_CHANGED,
              );
            }}
          />
        ))}
      </div>

      {carried?.by === "drag" && pointer ? (
        <div
          className="annotation-ghost"
          aria-hidden="true"
          style={{ left: pointer.x, top: pointer.y }}
        >
          {lineText(carried.item)}
        </div>
      ) : null}

      {making ? (
        <NewCollectionModal
          onClose={() => setMaking(false)}
          onDone={async (said) => {
            setMaking(false);
            await done(said, COLLECTIONS_CHANGED);
          }}
        />
      ) : null}
      {adding !== null ? (
        <AddModal
          collection={adding}
          collections={collections}
          wordings={wordings}
          compilations={compilations.map((c) => c.slug)}
          onClose={() => setAdding(null)}
          onSaved={async (kind, into) => {
            setAdding(null);
            openBox(into);
            await done(kind === "link" ? t("linkAdded") : t("annotationAdded"));
          }}
        />
      ) : null}
      {editing ? (
        <EditModal
          item={editing.item}
          from={editing.from}
          collections={collections}
          wordings={wordings}
          wordingName={wordingName(editing.item.anchor, translations, compilations, t)}
          defaultCompilation={compilations[0]?.slug ?? ""}
          readIn={readIn}
          onClose={() => setEditing(null)}
          onDone={async (said) => {
            setEditing(null);
            await done(said);
          }}
        />
      ) : null}
      {translating && (translating.anchor || unpinnedIn) ? (
        <TranslationModal
          item={translating}
          wordings={wordings}
          unpinnedIn={unpinnedIn}
          wordingName={wordingName(translating.anchor, translations, compilations, t)}
          onClose={() => setTranslating(null)}
          onDone={async (said) => {
            setTranslating(null);
            await done(said);
          }}
        />
      ) : null}
    </div>
  );
}

/** A wastebasket, drawn in the text's color. */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5" />
    </svg>
  );
}

/** An item in a few words: its verses, and its words. */
function lineText(item: Item): string {
  return item.quote ? `${item.passage.label} “${item.quote}”` : item.passage.label;
}

function CollectionBox({
  id,
  title,
  count,
  own,
  expanded,
  list,
  carrying,
  over,
  hydrated,
  shortWording,
  tipsIn,
  onToggle,
  onDrop,
  onAdd,
  onMore,
  onOpen,
  onTranslate,
  onTrash,
  onPress,
  onPick,
  onRename,
  onDelete,
}: {
  id: string;
  title: string;
  count: number;
  /** One of the user's collections (not the default one): it can be renamed and deleted. */
  own: boolean;
  expanded: boolean;
  list: List | undefined;
  /** An item is being carried: the box is a place to drop it. */
  carrying: boolean;
  over: boolean;
  hydrated: boolean;
  shortWording: (item: Item) => string | null;
  /** The translation an item's passages open in, in their tooltips. */
  tipsIn: (item: Item) => string;
  onToggle: () => void;
  onDrop: () => void;
  onAdd: () => void;
  onMore: () => void;
  onOpen: (item: Item) => void;
  /** Its translation opened (from its wording's abbreviation): only for an item pinned to words. */
  onTranslate: (item: Item) => void;
  /** Its trash icon pressed: deleted once the user confirms. */
  /** Its trash icon: out of this collection (and deleted, in no other). */
  onTrash: (item: Item) => void;
  onPress: (item: Item, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPick: (item: Item) => void;
  onRename: (title: string) => Promise<boolean>;
  onDelete: () => Promise<void>;
}) {
  const t = useTranslations("annotations");
  const panel = useId();
  /** In another collection too: its trash icon only takes it out of this one. */
  const stays = (item: Item) => id !== "default" && item.collections.some((c) => c !== id);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);
  const classes = ["annotation-box", carrying ? "drop-target" : "", over ? "drop-over" : ""];
  return (
    <section
      className={classes.filter(Boolean).join(" ")}
      data-drop-collection={id}
      aria-labelledby={`${panel}-head`}
    >
      <h2 className="annotation-box-head">
        <button
          id={`${panel}-head`}
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? panel : undefined}
          disabled={!hydrated}
          onClick={carrying ? onDrop : onToggle}
        >
          <span className="annotation-box-arrow" aria-hidden="true">
            {carrying ? "⤓" : expanded ? "▾" : "▸"}
          </span>
          <span className="annotation-box-title">{title}</span>{" "}
          <span className="annotation-box-count">({t("count", { count })})</span>
        </button>
      </h2>
      {expanded ? (
        <div id={panel} className="annotation-box-body">
          <div className="annotation-scroll">
            {!list ? null : list.items.length === 0 ? (
              <p className="annotation-empty">{t("none")}</p>
            ) : (
              <ul className="annotation-rows">
                {list.items.map((item) => {
                  const wording = shortWording(item);
                  return (
                    <li key={`${item.kind}:${item.id}`} className="annotation-row">
                      <button
                        type="button"
                        className="annotation-handle"
                        aria-label={t("handle", { item: lineText(item) })}
                        title={t("handleHint")}
                        onPointerDown={(e) => onPress(item, e)}
                        onClick={() => onPick(item)}
                      >
                        <span aria-hidden="true">⠿</span>
                      </button>
                      {/* Its own button: a button can't be inside the line's. */}
                      {wording ? (
                        <button
                          type="button"
                          className="annotation-wording"
                          aria-label={t("wordingButton", { wording, item: lineText(item) })}
                          title={t("wordingHint")}
                          onClick={() => onTranslate(item)}
                        >
                          {wording}
                        </button>
                      ) : null}
                      {/*
                       * The line opens the item: its button lies over the text, and its passages,
                       * the plugin's links (their tooltips), over the button.
                       */}
                      <div className="annotation-line">
                        <button
                          type="button"
                          className="annotation-open"
                          aria-labelledby={`${panel}-${item.kind}-${item.id}`}
                          onClick={() => onOpen(item)}
                        />
                        <span id={`${panel}-${item.kind}-${item.id}`}>
                          <span className="annotation-line-ref">
                            <PassageLink
                              osis={item.passage.osis}
                              label={item.passage.label}
                              translation={tipsIn(item)}
                              id={`${item.kind}:${item.id}:from`}
                            />
                          </span>
                          {item.quote ? (
                            <span className="annotation-line-quote"> “{item.quote}”</span>
                          ) : null}
                          {item.target ? (
                            <span className="annotation-line-target">
                              {" → "}
                              <PassageLink
                                osis={item.target.osis}
                                label={item.target.label}
                                translation={tipsIn(item)}
                                id={`${item.kind}:${item.id}:to`}
                              />
                            </span>
                          ) : null}
                          {item.text ? (
                            <span className="annotation-line-text"> {item.text}</span>
                          ) : null}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="annotation-trash"
                        aria-label={
                          stays(item)
                            ? t("removeItem", { item: lineText(item), collection: title })
                            : t("deleteItem", { item: lineText(item) })
                        }
                        title={stays(item) ? t("removeHint") : t("delete")}
                        onClick={() => onTrash(item)}
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {list?.more ? (
              <button
                type="button"
                className="action-button secondary annotation-more"
                onClick={onMore}
              >
                {t("more")}
              </button>
            ) : null}
          </div>
          {renaming ? (
            <form
              className="annotation-box-actions"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onRename(name)) setRenaming(false);
              }}
            >
              <label>
                {t("collectionTitle")}{" "}
                <input
                  type="text"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button type="submit" className="action-button" disabled={!name.trim()}>
                {t("save")}
              </button>
              <button
                type="button"
                className="action-button secondary"
                onClick={() => setRenaming(false)}
              >
                {t("cancel")}
              </button>
            </form>
          ) : (
            <div className="annotation-box-actions">
              <button
                type="button"
                className="action-button"
                aria-label={t("addTo", { collection: title })}
                onClick={onAdd}
              >
                {t("add")}
              </button>
              {own ? (
                <>
                  <button
                    type="button"
                    className="action-button secondary"
                    onClick={() => {
                      setName(title);
                      setRenaming(true);
                    }}
                  >
                    {t("rename")}
                  </button>
                  <button
                    type="button"
                    className="action-button danger"
                    onClick={() => void onDelete()}
                  >
                    {t("deleteCollection")}
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
