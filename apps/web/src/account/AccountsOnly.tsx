import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { instance } from "../instance.ts";

/**
 * The layout of every page that needs accounts (sign-in, the account, compilations,
 * publications): not found while this instance has accounts closed (vision §10).
 */
export async function AccountsOnly({ children }: { children: ReactNode }) {
  if (!(await instance()).accountsOpen) notFound();
  return children;
}
