import { connection } from "next/server";

/**
 * This instance's own settings (instance policy, vision §7.1), from the environment at request
 * time, so one image serves any instance. Server components only.
 */
export interface Instance {
  /** `ACCOUNTS=closed` hides sign-in, accounts and everything that needs them. */
  accountsOpen: boolean;
  /** `CONTACT_EMAIL`: where the contact page sends people; null hides it. */
  contactEmail: string | null;
}

/** Reads `ACCOUNTS` (`open` when not set); anything else is refused, as the API does. */
export function accountsOpenFrom(value: string | undefined): boolean {
  if (value === undefined || value === "" || value === "open") return true;
  if (value === "closed") return false;
  throw new Error(`ACCOUNTS must be "open" or "closed", not "${value}"`);
}

/** Reads `CONTACT_EMAIL`: one plain address, or null. */
export function contactEmailFrom(value: string | undefined): string | null {
  const address = value?.trim() ?? "";
  if (address === "") return null;
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(address)) {
    throw new Error(`CONTACT_EMAIL isn't an email address: "${address}"`);
  }
  return address;
}

/** The settings, read per request (never frozen into a build). */
export async function instance(): Promise<Instance> {
  await connection();
  return {
    accountsOpen: accountsOpenFrom(process.env["ACCOUNTS"]),
    contactEmail: contactEmailFrom(process.env["CONTACT_EMAIL"]),
  };
}
