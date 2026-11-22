"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ItemError, useItemAction } from "./itemModal.tsx";
import { Modal } from "./Modal.tsx";
import { send } from "./requests.ts";

/** A collection's description is at most this long (the API's limit). */
const MAX_DESCRIPTION = 2000;

/**
 * Makes a collection: its title, and a description, the preface for the translation it's printed
 * or published with. A refusal (a title already taken) is shown here, with what was typed kept.
 */
export function NewCollectionModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  /** It was made: the page reloads its collections and says so. */
  onDone: (said: string) => Promise<void>;
}) {
  const t = useTranslations("annotations");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { busy, error, run, answer } = useItemAction(onDone);

  return (
    <Modal title={t("newCollectionTitle")} closeLabel={t("close")} onClose={onClose}>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void run(async () =>
            answer(
              await send("/api/collections", "POST", {
                title,
                ...(description.trim() ? { description } : {}),
              }),
              t("saved"),
            ),
          );
        }}
      >
        <label>
          <span>{t("collectionTitle")}</span>
          <input
            type="text"
            value={title}
            required
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          <span>{t("collectionDescription")}</span>
          <textarea
            value={description}
            rows={5}
            maxLength={MAX_DESCRIPTION}
            onChange={(e) => setDescription(e.target.value)}
          />
          <small>{t("collectionDescriptionHint", { max: MAX_DESCRIPTION })}</small>
        </label>
        <ItemError error={error} />
        <button type="submit" disabled={busy || !title.trim()}>
          {t("create")}
        </button>
      </form>
    </Modal>
  );
}
