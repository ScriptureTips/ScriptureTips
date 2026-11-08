import { versification } from "./canonical.ts";
import {
  findReferences as find,
  type ParsedReference,
  type ParseOptions,
  type ParseResult,
  parseReference as parse,
} from "./parse.ts";

/**
 * The reading functions with the real versification tables behind them: references are checked
 * against their scheme and converted to the canonical scheme (domain-model §2.2). The light
 * entry (`light.ts`) is the same reading without them.
 */
export const findReferences = (text: string, options: ParseOptions): ParsedReference[] =>
  find(text, { versification, ...options });

export const parseReference = (text: string, options: ParseOptions): ParseResult =>
  parse(text, { versification, ...options });
