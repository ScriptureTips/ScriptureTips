"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorCode, useErrorText } from "../compilations/errors.ts";
import type { Item, Wording } from "./items.ts";
import { PassageLink } from "./PassageTips.tsx";
import { anchorWording, wordingKey } from "./requests.ts";

/** What an action on an item came to: done (with what to say), or the error's words. */
export type Outcome = { ok: true; said: string } | { ok: false; error: string };

/**
 * An item modal's actions: `run` does one (busy meanwhile); done, the page is told (and the modal
 * closes); failed, the error shows in the modal. `answer` reads a response as an outcome.
 */
export function useItemAction(onDone: (said: string) => Promise<void>) {
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (request: () => Promise<Outcome>) => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await request();
      if (outcome.ok) await onDone(outcome.said);
      else setError(outcome.error);
    } catch {
      setError(errorText("unavailable"));
    } finally {
      setBusy(false);
    }
  };
  const answer = async (res: Response, said: string): Promise<Outcome> =>
    res.ok ? { ok: true, said } : { ok: false, error: errorText(await errorCode(res)) };
  return { busy, error, run, answer, errorText };
}

/**
 * The wording an item's words are in (named as given if it's no longer listed: a compilation since
 * deleted, say); null when it isn't pinned to words.
 */
export function itemWording(
  item: Item,
  wordings: readonly Wording[],
  wordingName: string | null,
): Wording | null {
  const anchor = item.anchor;
  if (!anchor) return null;
  return (
    wordings.find((w) => wordingKey(w) === anchorWording(anchor)) ?? {
      in: anchor.in,
      compilation: anchor.in === "@compilation" ? anchor.compilation : "",
      label: wordingName ?? anchor.in,
    }
  );
}

/**
 * What the item is, at the top of its modals: its kind, verses, wording, words and target. With
 * `tips`, its passages are the plugin's links (`PassageTips` shows them), opening in that
 * translation.
 */
export function ItemSummary({
  item,
  wordingName,
  tips,
}: {
  item: Item;
  wordingName: string | null;
  tips?: string;
}) {
  const t = useTranslations("annotations");
  const passage = (p: { osis: string; label: string }) =>
    tips ? <PassageLink osis={p.osis} label={p.label} translation={tips} /> : p.label;
  return (
    <p className="annotation-summary">
      <strong>{item.kind === "link" ? t("link") : t("annotation")}</strong> {passage(item.passage)}
      {wordingName ? ` ${t("inWording", { wording: wordingName })}` : null}
      {item.quote ? (
        <>
          {" "}
          <q>{item.quote}</q>
        </>
      ) : null}
      {item.target ? <> → {passage(item.target)}</> : null}
    </p>
  );
}

/** The error an item modal shows, if any. */
export function ItemError({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
