/**
 * What a build of the site is told about its deployment, from the environment (the development
 * stack's addresses if not given). Everything is fixed when the site is built: the pages are
 * plain files.
 */
export interface Settings {
  /** `ST_SITE`: the app instance whose reader passages open in (vision §7.2). */
  readonly site: string;
  /** `ST_DATA`: this site's own address, the data server. */
  readonly data: string;
  /** `CONTACT_EMAIL`: where the contact page sends people; without it there is no contact page. */
  readonly contactEmail: string | null;
  /** `CHROME_STORE_URL`, `FIREFOX_STORE_URL`: the extension's listings, shown once they exist. */
  readonly chromeStore: string | null;
  readonly firefoxStore: string | null;
}

function origin(name: string, value: string | undefined, fallback: string): string {
  const text = value?.trim() || fallback;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${name} isn't an address: "${text}"`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error(`${name} must start with https://`);
  return url.origin;
}

function link(name: string, value: string | undefined): string | null {
  const text = value?.trim() ?? "";
  if (text === "") return null;
  if (!/^https:\/\/[^\s"<>]+$/.test(text)) throw new Error(`${name} must be an https:// address`);
  return text;
}

/** Reads `CONTACT_EMAIL` as the web app does: one plain address, or null. */
function email(value: string | undefined): string | null {
  const address = value?.trim() ?? "";
  if (address === "") return null;
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(address)) {
    throw new Error(`CONTACT_EMAIL isn't an email address: "${address}"`);
  }
  return address;
}

export function settingsFrom(env: Record<string, string | undefined>): Settings {
  return {
    site: origin("ST_SITE", env["ST_SITE"], "https://dev.scripturetips.com"),
    data: origin("ST_DATA", env["ST_DATA"], "https://dev.scripture.tips"),
    contactEmail: email(env["CONTACT_EMAIL"]),
    chromeStore: link("CHROME_STORE_URL", env["CHROME_STORE_URL"]),
    firefoxStore: link("FIREFOX_STORE_URL", env["FIREFOX_STORE_URL"]),
  };
}
