"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The book's name in the chapter bar, opening a dropdown of the books (`children`) under the bar.
 * Escape or a press outside closes it, and so does going to another page.
 */
export function BookMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  // Going to a book (a new page) closes the menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it closes when the path changes.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLElement>(".book-dropdown-button")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <span ref={root} className="book-dropdown">
      <button
        type="button"
        className="book-dropdown-button"
        aria-expanded={open}
        aria-controls="book-dropdown-panel"
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open ? (
        <div id="book-dropdown-panel" className="book-dropdown-panel">
          {children}
        </div>
      ) : null}
    </span>
  );
}
