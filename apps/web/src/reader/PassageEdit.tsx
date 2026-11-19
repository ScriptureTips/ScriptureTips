"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "../hydrated.ts";

/**
 * The passage's bold title, edited in place: pressing it turns it into a field, with a Read
 * button beside it, to type another passage or range ("John 3:16", "Joel 2:28–32"). Escape puts
 * the title back. Reading it is the reader's GET form, so it needs no script to go.
 */
export function PassageTitle({
  translation,
  also = [],
  title,
  shown,
  direction,
  labels,
}: {
  translation: string;
  /** The other translations shown with it, kept when another passage is read. */
  also?: readonly string[];
  title: string;
  /** What the button says when it's not the whole title (the bar already names the chapter). */
  shown?: string;
  direction: "ltr" | "rtl";
  labels: { change: string; field: string; read: string };
}) {
  const hydrated = useHydrated();
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  if (!editing)
    return (
      <h1 className="passage-label passage-title" dir={direction}>
        <button
          type="button"
          className="passage-title-button"
          disabled={!hydrated}
          title={labels.change}
          aria-label={title}
          onClick={() => setEditing(true)}
        >
          {shown ?? title}
          {/* A pencil, so it's known to be editable. */}
          <svg
            className="passage-title-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </h1>
    );
  return (
    <form
      className="passage-title-form"
      action="/read"
      method="get"
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
      }}
      // Leaving the field (and its button) puts the title back.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setEditing(false);
      }}
    >
      <input type="hidden" name="t" value={translation} />
      {also.length > 0 ? <input type="hidden" name="with" value={also.join(",")} /> : null}
      <input
        ref={input}
        name="ref"
        aria-label={labels.field}
        defaultValue={title}
        required
        maxLength={200}
      />
      {/* Pressing it keeps the focus in the field (some browsers don't focus a button), so the
          press isn't taken for leaving. */}
      <button type="submit" onMouseDown={(e) => e.preventDefault()}>
        {labels.read}
      </button>
    </form>
  );
}
