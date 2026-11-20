"use client";

import { bindHoverTip } from "@scripturetips/scripture-links/hover-tip";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * A tooltip that opens over its trigger on hover, keyboard focus or a tap, whose text can be
 * reached and selected. The behavior is `bindHoverTip` (`@scripturetips/scripture-links`), shared
 * with the website plugin and the browser extension: leaving closes it after a short delay and
 * going back onto the trigger or the tip cancels that, so the pointer can cross a gap and the
 * tip is never moved to hide one; pressing on the tip's text doesn't close it; Escape or a press
 * outside does; on touch the first tap on a link trigger opens it without following the link.
 *
 * The trigger is `children` (a link or button, which takes the focus; the caller gives it
 * `aria-describedby` with this `id`). The look and place of the tip are the stylesheet's
 * (`.hover-tip`, `.hover-tip-body`, open when `.hover-tip[data-open]`; pass `className` and
 * `tipClassName` for a use's own).
 */
export function HoverTip({
  id,
  tip,
  children,
  className,
  tipClassName,
  as: Wrapper = "span",
  delay,
}: {
  /** The tip's id, for the trigger's `aria-describedby`. */
  id: string;
  tip: ReactNode;
  children: ReactNode;
  className?: string;
  tipClassName?: string;
  /** The wrapper's element (`sup` for a mark in running text). */
  as?: "span" | "sup";
  /** Milliseconds from the pointer leaving to the tip closing. */
  delay?: number;
}) {
  const wrapper = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    return bindHoverTip(el, delay === undefined ? {} : { delay }).destroy;
  }, [delay]);

  return (
    <Wrapper ref={wrapper as never} className={`hover-tip${className ? ` ${className}` : ""}`}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={`hover-tip-body${tipClassName ? ` ${tipClassName}` : ""}`}
      >
        {tip}
      </span>
    </Wrapper>
  );
}
