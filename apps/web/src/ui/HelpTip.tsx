"use client";

import { type ReactNode, useId } from "react";
import { HoverTip } from "./HoverTip.tsx";

/**
 * A help icon ("?") beside a label: hovering, focusing or tapping it shows `children`, which can be
 * read and selected (`HoverTip`). `label` names the button ("About the note").
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <HoverTip id={id} tip={children} className="help-tip" tipClassName="help-tip-body">
      <button type="button" className="help-tip-button" aria-label={label} aria-describedby={id}>
        ?
      </button>
    </HoverTip>
  );
}
