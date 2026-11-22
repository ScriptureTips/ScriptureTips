"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * A modal dialog (the native `<dialog>`: focus kept inside, Escape closes it), open while it's
 * mounted, in the page's own DOM so its styles and the browser's text selection work in it (the
 * shared `modalDialog` is in a shadow root, where a selection can't be read). The close button,
 * Escape and a press on the backdrop close it; a press that starts inside it (selecting words, say)
 * and ends on the backdrop doesn't.
 */
export function Modal({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  /** It closed: the caller unmounts it. */
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressed = useRef<EventTarget | null>(null);
  const heading = useId();

  // Opened once; never closed from a cleanup, whose `close` event would unmount it (React runs a
  // cleanup and the effect again in development). Unmounted, it leaves the page, closed.
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Escape closes what's open in the modal first (a help tip, a list of suggestions, a passage's
  // tooltip), not the modal: its default (closing the dialog) is prevented when one of them
  // closes on it. A help tip and a list close on any Escape, so they're seen before they react
  // (a help tip stops the event there). A passage's tooltip may not close (pinned, with the focus
  // elsewhere): its links are counted before and after it has had the key, and with none closed,
  // Escape closes the modal.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const tips = () => d.querySelectorAll('a.st-ref[aria-expanded="true"]').length;
    let before = 0;
    const first = (e: KeyboardEvent) => {
      before = 0;
      if (e.key !== "Escape" || !d.open || !e.composedPath().includes(d)) return;
      const at = e.composedPath()[0];
      if (
        d.querySelector(".hover-tip[data-open]") ||
        (at instanceof Element && at.getAttribute("aria-expanded") === "true")
      )
        e.preventDefault();
      else before = tips();
    };
    const last = (e: KeyboardEvent) => {
      if (e.key === "Escape" && before > 0 && tips() < before) e.preventDefault();
      before = 0;
    };
    window.addEventListener("keydown", first, true);
    window.addEventListener("keydown", last);
    return () => {
      window.removeEventListener("keydown", first, true);
      window.removeEventListener("keydown", last);
    };
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop click adds to Escape and the close button.
    <dialog
      ref={dialog}
      className="modal annotation-modal"
      aria-labelledby={heading}
      onClose={onClose}
      onPointerDown={(e) => {
        pressed.current = e.target;
      }}
      onClick={(e) => {
        if (e.target === dialog.current && pressed.current === dialog.current)
          dialog.current.close();
      }}
    >
      <div className="modal-body">
        <header className="modal-header">
          <h2 id={heading}>{title}</h2>
          <button
            type="button"
            className="modal-close"
            aria-label={closeLabel}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
