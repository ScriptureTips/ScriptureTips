"use client";

import type { ReactNode } from "react";
import { forgetStudyBox } from "../study/StudyMenu.tsx";

/** A link into a compilation: opening one resets where the study window was left. */
export function ForgetStudyBoxLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className} onClick={forgetStudyBox}>
      {children}
    </a>
  );
}
