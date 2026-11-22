"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ItemError, ItemSummary, itemWording, useItemAction } from "./itemModal.tsx";
import type { Item, Wording } from "./items.ts";
import { Modal } from "./Modal.tsx";
import { PassageWords, type Words } from "./PassageWords.tsx";
import { send, wordingKey } from "./requests.ts";
import { WordingSelect } from "./WordingSelect.tsx";

/**
 * An item's translation (vision §3.7.2), opened from the abbreviation on its line: its verse in
 * full, in the wording its words are in now, with them marked; and another wording to move or copy
 * it to. Choosing Copy or Move shows the same verses in that wording, where the user selects the
 * same words (one translation's words rarely line up with another's): the copy, or the item
 * itself, is pinned to them. A link not pinned to words is shown where it's read (`unpinnedIn`),
 * nothing marked, and is pinned to words in any wording, that one too.
 */
export function TranslationModal({
  item,
  wordings,
  unpinnedIn,
  wordingName,
  onClose,
  onDone,
}: {
  item: Item;
  wordings: readonly Wording[];
  /** Where an item not pinned to words is read (the first compilation's own wording). */
  unpinnedIn: Wording | null;
  /** The wording its words are in, as named. */
  wordingName: string | null;
  onClose: () => void;
  /** Moved or copied: the page reloads, says it, and this closes. */
  onDone: (said: string) => Promise<void>;
}) {
  const t = useTranslations("annotations");
  const { busy, error, run, answer } = useItemAction(onDone);
  const [toAt, setToAt] = useState("");
  const [how, setHow] = useState<"copy" | "move" | null>(null);
  const [words, setWords] = useState<Words | null>(null);
  const anchor = item.anchor;
  const quote = item.quote;
  const pinned = anchor !== null && quote !== null;
  const current = (itemWording(item, wordings, wordingName) ?? unpinnedIn) as Wording;
  // The compilation a translation's words are read in: the one the item was made in.
  const readIn = anchor?.compilation || current.compilation;
  const to = wordings.find((w) => wordingKey(w) === toAt) ?? null;
  const mark = useMemo(() => (anchor && quote ? { anchor, quote } : undefined), [anchor, quote]);
  const shownIn = pinned
    ? t("nowIn", { wording: current.label })
    : t("notPinnedIn", { wording: current.label });

  const pin = (chosen: "copy" | "move") =>
    run(async () => {
      if (!words) return { ok: false, error: t("noSelection") };
      return chosen === "copy"
        ? answer(
            await send(`/api/collections/items/${item.kind}/${item.id}/copies`, "POST", {
              collections: item.collections,
              words,
            }),
            t("copied"),
          )
        : answer(
            await send(`/api/collections/items/${item.kind}/${item.id}/words`, "PUT", words),
            t("moved"),
          );
    });

  return (
    <Modal title={t("translationTitle")} closeLabel={t("close")} onClose={onClose}>
      {/* Styled as a form (the forms skill), though nothing in it is typed and sent. */}
      <div className="account-form">
        <ItemSummary item={item} wordingName={wordingName} />
        <ItemError error={error} />
        <h3>{shownIn}</h3>
        <PassageWords
          passage={item.passage.osis}
          wording={current}
          compilation={readIn}
          label={shownIn}
          {...(mark ? { mark } : {})}
        />
        {how === null ? (
          <>
            <WordingSelect
              label={t("moveOrCopyTo")}
              // Pinned, it moves elsewhere; not pinned, its words can be chosen where it's read too.
              wordings={wordings.filter((w) => !pinned || wordingKey(w) !== wordingKey(current))}
              value={toAt}
              onChange={setToAt}
              placeholder={t("choose")}
            />
            {to ? (
              <>
                <small>
                  {pinned
                    ? t("translationHint", { kind: item.kind })
                    : t("pinHint", { kind: item.kind })}
                </small>
                <div className="actions">
                  <button type="button" className="action-button" onClick={() => setHow("copy")}>
                    {t("copy")}
                  </button>
                  <button type="button" className="action-button" onClick={() => setHow("move")}>
                    {t("move")}
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : to ? (
          <>
            <h3>{t("pickIn", { wording: to.label })}</h3>
            <PassageWords
              passage={item.passage.osis}
              wording={to}
              // A translation's words are read in the compilation the original was made in.
              compilation={to.compilation || readIn}
              label={to.label}
              onPick={setWords}
            />
            <div className="actions">
              <button
                type="button"
                className="action-button"
                disabled={!words || busy}
                onClick={() => void pin(how)}
              >
                {how === "copy" ? t("copyHere") : t("moveHere")}
              </button>
              <button
                type="button"
                className="action-button secondary"
                onClick={() => {
                  setHow(null);
                  setWords(null);
                }}
              >
                {t("back")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
