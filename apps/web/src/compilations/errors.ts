"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/** The error code in an API response, or `unavailable`. */
export async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * Words an error code: compilation errors first, then the reference parser's (`errors`). The same
 * function from one render to the next, so an effect can depend on it without running again.
 */
export function useErrorText(): (code: string) => string {
  const tc = useTranslations("compilationErrors");
  const te = useTranslations("errors");
  return useCallback(
    (code: string) => (tc.has(code) ? tc(code) : te.has(code) ? te(code) : tc("unavailable")),
    [tc, te],
  );
}
