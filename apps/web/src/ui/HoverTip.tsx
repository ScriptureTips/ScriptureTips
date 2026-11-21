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
    return bindHoverTip(el, {
      ...(delay === undefined ? {} : { delay }),
      onChange: (open) => {
        const tip = el.querySelector<HTMLElement>(":scope > .hover-tip-body.note-tip");
        // On a phone the tip is a panel along the bottom (the stylesheet's).
        if (!open || !tip || window.innerWidth <= 640) return;
        // Fixed, from the trigger's place: an absolute tip is misplaced when its text is split
        // across the columns of the reading area.
        const at = el.getBoundingClientRect();
        // Where `top: 0; left: 0` lands is the tip's origin: not the window's corner inside a
        // transformed ancestor (the comparison table slides sideways), which fixed boxes follow.
        tip.style.top = "0px";
        tip.style.left = "0px";
        const box = tip.getBoundingClientRect();
        const above = at.top - box.height - 6 >= 8;
        const top = above ? at.top - box.height - 6 : at.bottom + 6;
        // Inside a transformed ancestor a fixed box is clipped by the boxes that clip it (the
        // comparison table's scroller): it's kept within those as well as the window.
        let minX = 0;
        let maxX = window.innerWidth;
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (getComputedStyle(p).overflowX === "visible") continue;
          const r = p.getBoundingClientRect();
          minX = Math.max(minX, r.left);
          maxX = Math.min(maxX, r.right);
        }
        const left = Math.max(
          minX + 8,
          Math.min(at.left + at.width / 2 - box.width / 2, maxX - box.width - 8),
        );
        tip.style.top = `${top - box.top}px`;
        tip.style.left = `${left - box.left}px`;
      },
    }).destroy;
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
