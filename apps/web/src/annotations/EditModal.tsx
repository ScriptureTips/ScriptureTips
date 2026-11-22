"use client";

import { configureSearch, getSearch } from "@scripturetips/search";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { MAX_TEXT } from "../study/links.ts";
import type { Collection } from "../study/yourNotes.ts";
import { HelpTip } from "../ui/HelpTip.tsx";
import { ItemError, ItemSummary, itemWording, useItemAction } from "./itemModal.tsx";
import type { Item, Wording } from "./items.ts";
import { Modal } from "./Modal.tsx";
import { PassageWords } from "./PassageWords.tsx";
import { linkTarget, send } from "./requests.ts";

/** The search widget's instance for a link's new target. */
const TARGET_SEARCH = "annotation-target";

/**
 * An item opened from its collection (vision §3.7.2): its text (an annotation's) or note (a
 * link's), and where a link goes, changed; or taken out of the collection it was opened from. It's
 * deleted from the trash icon on its line, and its translation is changed in `TranslationModal`, from the abbreviation on its line.
 */
export function EditModal({
  item,
  from,
  collections,
  wordings,
  wordingName,
  defaultCompilation,
  readIn,
  onClose,
  onDone,
}: {
  item: Item;
  /** The collection it was opened from: `default`, or a collection's ID. */
  from: string;
  collections: readonly Collection[];
  wordings: readonly Wording[];
  /** The wording its words are in, as named (null: not pinned to words). */
  wordingName: string | null;
  /** A compilation of the user's, for a link without words to retype its target in. */
  defaultCompilation: string;
  /**
   * The translation a wording reads its references in (a compilation's own wording: its base):
   * a link's new target is searched in it, and its passages' tooltips open in it.
   */
  readIn: (wording: Wording) => string;
  onClose: () => void;
  /** Something changed: the page reloads, says it, and this closes. */
  onDone: (said: string) => Promise<void>;
}) {
  const t = useTranslations("annotations");
  const { busy, error, run, answer, errorText } = useItemAction(onDone);
  const [text, setText] = useState(item.text ?? "");
  const isLink = item.kind === "link";
  // The numbering a link's new target is typed in: its words' wording's, or (not pinned to words)
  // the user's first compilation's.
  const numbering: Wording = itemWording(item, wordings, wordingName) ??
    wordings.find((w) => w.in === "@compilation" && w.compilation === defaultCompilation) ?? {
      in: "@compilation",
      compilation: defaultCompilation,
      label: defaultCompilation,
    };
  const searchIn = readIn(numbering);
  // A link's verses are shown first, in full (its words marked, if it's pinned to some).
  const verseIn =
    numbering.in === "@compilation" ? numbering.compilation : item.anchor?.compilation;
  const anchor = item.anchor;
  const quote = item.quote;
  const mark = useMemo(() => (anchor && quote ? { anchor, quote } : undefined), [anchor, quote]);
  const url = isLink ? `/api/links/${item.id}` : `/api/annotations/${item.id}`;

  // A link's new target is typed in the search widget's field (its own instance), with books
  // suggested and the passages it finds listed under it; picking one puts it in the field. The
  // field's text is what's saved, picked or typed. Words are matched in every translation, and
  // each verse found is shown in the wording's translation (whose words the user may not know).
  useEffect(() => {
    if (!isLink) return;
    void import("@scripturetips/search/elements");
    configureSearch(TARGET_SEARCH, {
      scope: {
        kinds: ["reference", "text"],
        showIn: searchIn,
        limit: 8,
        previewLength: 80,
      },
      searchOnType: true,
      strings: { label: t("newTarget"), placeholder: t("targetPlaceholder") },
      onSelect: ({ result }) => {
        if (result.kind !== "original") getSearch(TARGET_SEARCH).setQuery(result.label);
      },
    }).clear();
    return () => {
      configureSearch(TARGET_SEARCH, { onSelect: null }).clear();
    };
  }, [isLink, searchIn, t]);
  const fromTitle = collections.find((c) => c.id === from)?.title ?? null;

  const save = () =>
    run(async () => {
      if (!isLink) return answer(await send(url, "PATCH", { body: text }), t("saved"));
      const changes: {
        note: string;
        target?: string | { reference: string; translation: string };
        compilation?: string;
      } = { note: text };
      const target = getSearch(TARGET_SEARCH).getQuery().trim();
      if (target) {
        const found = await linkTarget(numbering, target);
        if (!found.ok) return { ok: false, error: errorText(found.code) };
        changes.target = found.target;
        changes.compilation = found.compilation ?? item.anchor?.compilation ?? defaultCompilation;
      }
      return answer(await send(url, "PATCH", changes), t("saved"));
    });

  const takeOut = () =>
    run(async () =>
      answer(
        await send(`/api/collections/items/${item.kind}/${item.id}`, "PUT", {
          collections: item.collections.filter((c) => c !== from),
        }),
        t("removed", { collection: fromTitle ?? "" }),
      ),
    );

  return (
    <Modal
      title={isLink ? t("editLinkTitle") : t("editAnnotationTitle")}
      closeLabel={t("close")}
      onClose={onClose}
    >
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {isLink ? (
          <PassageWords
            passage={item.passage.osis}
            wording={numbering}
            compilation={verseIn || defaultCompilation}
            label={item.passage.label}
            {...(mark ? { mark } : {})}
          />
        ) : null}
        <ItemSummary
          item={item}
          wordingName={wordingName}
          {...(isLink ? { tips: searchIn } : {})}
        />
        <ItemError error={error} />
        <div className="field">
          <span className="field-label">
            <label htmlFor={`${item.id}-text`}>{isLink ? t("note") : t("text")}</label>
            {isLink ? <HelpTip label={t("noteHelpLabel")}>{t("noteHelp")}</HelpTip> : null}
          </span>
          <textarea
            id={`${item.id}-text`}
            value={text}
            rows={3}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {isLink ? (
          // A field, not a label: the search widget's input is in its own shadow root, named there.
          <div className="field">
            <span aria-hidden="true">{t("newTarget")}</span>
            <st-search-input
              className="annotation-target"
              instance={TARGET_SEARCH}
              placeholder={t("targetPlaceholder")}
              hide-button
              results-as-suggestions
            />
            <small>
              {t("newTargetHint", { wording: numbering.label, passage: item.target?.label ?? "" })}
            </small>
          </div>
        ) : null}
        <div className="actions">
          <button type="submit" disabled={busy || (!isLink && !text.trim())}>
            {t("save")}
          </button>
        </div>
        {fromTitle ? (
          <div className="actions annotation-form-end">
            <button
              type="button"
              className="action-button secondary"
              disabled={busy}
              onClick={() => void takeOut()}
            >
              {t("removeFrom", { collection: fromTitle })}
            </button>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
