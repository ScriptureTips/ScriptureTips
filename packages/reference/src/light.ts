/**
 * The light entry: reading references without the versification tables, for the website plugin
 * and the browser extension, whose bundles must stay small. It finds and reads references in
 * the KJV's numbering with the KJV's verse counts (`KJV_VERSES`), so "Psalm 23" is read as a
 * whole chapter and "John 99:1" is left alone; it doesn't convert to the canonical scheme
 * (`canonical` is undefined): the server does, from the reference and the scheme.
 */

import { KJV_VERSES } from "./kjv-counts.ts";
import {
  findReferences as find,
  type ParsedReference,
  type ParseOptions,
  type ParseResult,
  parseReference as parse,
} from "./parse.ts";

export { english } from "./english.ts";
export { type FormatOptions, formatPassage } from "./format.ts";
export { KJV_BOOKS, KJV_VERSES } from "./kjv-counts.ts";
export type { ParsedReference, ParseOptions, ParseResult } from "./parse.ts";

/** The options the light entry reads with: the KJV, and its verse counts. */
const defaults = (options: Partial<ParseOptions>): ParseOptions => ({
  scheme: "kjv",
  verses: KJV_VERSES,
  ...options,
});

/** The references in a piece of text, read in the KJV's numbering (or the options'). */
export const findReferences = (
  text: string,
  options: Partial<ParseOptions> = {},
): ParsedReference[] => find(text, defaults(options));

/** One reference or a list of them filling the whole input, read as above. */
export const parseReference = (text: string, options: Partial<ParseOptions> = {}): ParseResult =>
  parse(text, defaults(options));
