"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorCode, useErrorText } from "../compilations/errors.ts";
import { MAX_TEXT } from "../study/links.ts";
import type { Collection } from "../study/yourNotes.ts";
import type { Wording } from "./items.ts";
import { Modal } from "./Modal.tsx";
import { PassageWords, type Words } from "./PassageWords.tsx";
import { anchorSource, findPassage, linkTarget, send, wordingKey } from "./requests.ts";
import { WordingSelect } from "./WordingSelect.tsx";

/**
 * A new annotation, made on the annotations page (vision §3.7.2): in a collection, on words the
 * user selects in a passage of a translation (or a compilation's own wording), with a comment, a
 * link to another passage, or both. Never neither: Save waits for words and one of the two. With
 * a link it's a link (the comment its note); without, an annotation (the comment its text).
 */
export function AddModal({
  collection,
  collections,
  wordings,
  compilations,
  onClose,
  onSaved,
}: {
  /** The collection it goes in first (`default`, or a collection's ID). */
  collection: string;
  collections: readonly Collection[];
  wordings: readonly Wording[];
  /** The user's compilations (slugs), first one first. */
  compilations: readonly string[];
  onClose: () => void;
  /** Saved: what it is, and the collection it went in. */
  onSaved: (kind: "link" | "annotation", into: string) => Promise<void>;
}) {
  const t = useTranslations("annotations");
  const errorText = useErrorText();
  const [into, setInto] = useState(collection);
  const firstOwn = wordings.find((w) => w.in === "@compilation") ?? wordings[0];
  const [wordingAt, setWordingAt] = useState(firstOwn ? wordingKey(firstOwn) : "");
  const [typed, setTyped] = useState("");
  const [passage, setPassage] = useState<{ canonical: string; label: string } | null>(null);
  const [words, setWords] = useState<Words | null>(null);
  const [link, setLink] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const wording = wordings.find((w) => wordingKey(w) === wordingAt);
  // The compilation the words are read in: the wording's own, or (for a translation's words, whose
  // marks don't depend on it) the user's first. The API needs one of theirs either way.
  const compilation = wording?.in === "@compilation" ? wording.compilation : compilations[0];
  const filled = comment.trim() !== "" || link.trim() !== "";

  const show = async () => {
    if (!wording || !typed.trim()) return;
    setError(null);
    const found = await findPassage(wording, typed);
    // Words chosen in other verses (or another wording) are gone with them.
    setWords(null);
    if (!found.ok) {
      setPassage(null);
      setError(errorText(found.code));
      return;
    }
    setPassage({ canonical: found.canonical, label: found.label });
  };

  const save = async () => {
    if (!wording || !compilation || !words || !filled) return;
    setSaving(true);
    setError(null);
    try {
      const common = {
        compilation,
        source: anchorSource(words.anchor),
        quote: words.quote,
        anchor: words.anchor,
        collections: into === "default" ? [] : [into],
      };
      let res: Response;
      if (link.trim()) {
        const target = await linkTarget(wording, link);
        if (!target.ok) {
          setError(errorText(target.code));
          return;
        }
        res = await send("/api/links", "POST", {
          ...common,
          target: target.target,
          ...(comment.trim() ? { note: comment } : {}),
        });
      } else res = await send("/api/annotations", "POST", { ...common, body: comment });
      if (!res.ok) {
        setError(errorText(await errorCode(res)));
        return;
      }
      await onSaved(link.trim() ? "link" : "annotation", into);
    } catch {
      setError(errorText("unavailable"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t("addTitle")} closeLabel={t("close")} onClose={onClose}>
      {/* One form (forms can't nest): Enter in the reference field shows its verses instead. */}
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {compilations.length === 0 ? <p className="error">{t("noCompilation")}</p> : null}
        <label>
          <span>{t("collection")}</span>
          <select value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="default">{t("defaultCollection")}</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <WordingSelect
          label={t("wording")}
          wordings={wordings}
          value={wordingAt}
          onChange={(key) => {
            setWordingAt(key);
            setPassage(null);
            setWords(null);
          }}
        />
        <div className="annotation-reference">
          <label>
            <span>{t("reference")}</span>
            <input
              type="text"
              value={typed}
              maxLength={200}
              placeholder={t("referenceExample")}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (typed.trim() && wording) void show();
              }}
            />
          </label>
          <button
            type="button"
            className="action-button secondary"
            disabled={!typed.trim() || !wording}
            onClick={() => void show()}
          >
            {t("show")}
          </button>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {passage && wording && compilation ? (
          <>
            <p>{t("pick")}</p>
            <PassageWords
              passage={passage.canonical}
              wording={wording}
              compilation={compilation}
              label={`${passage.label} (${wording.label})`}
              onPick={setWords}
            />
          </>
        ) : null}
        <label>
          <span>{t("linkTo")}</span>
          <input
            type="text"
            value={link}
            maxLength={200}
            onChange={(e) => setLink(e.target.value)}
          />
          <small>{t("linkHint", { wording: wording?.label ?? "" })}</small>
        </label>
        <label>
          <span>{t("comment")}</span>
          <textarea
            value={comment}
            rows={3}
            maxLength={MAX_TEXT}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        {words && !filled ? <p className="annotation-needs">{t("needsContent")}</p> : null}
        <div className="actions">
          <button type="submit" disabled={!words || !filled || !compilation || saving}>
            {t("save")}
          </button>
          <button type="button" className="action-button secondary" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
