"use client";

import { useEffect, useRef, useState } from "react";

/** How long a toast shows, then how long it takes to fade (the CSS transition's length). */
const SHOWN_MS = 5000;
const FADE_MS = 250;

/**
 * A short note of what just happened ("Saved.", "Moved."), shown at the foot of the window for a
 * few seconds, then faded and gone (`onDone`: the caller clears its message). The region is always
 * on the page (`role="status"`), so a screen reader announces each message as it appears. A new
 * message replaces the one showing and starts again; to show the same one again, clear it first.
 */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    setLeaving(false);
    if (!message) return;
    const fade = window.setTimeout(() => setLeaving(true), SHOWN_MS);
    const end = window.setTimeout(() => done.current(), SHOWN_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(end);
    };
  }, [message]);

  return (
    <div className="toast-region" role="status">
      {message ? (
        <p className="toast" data-leaving={leaving ? "" : undefined}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
