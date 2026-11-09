export { CHOICES_KEY, type Choices, createChoices, pageStorage } from "./choices.ts";
export { type Client, ClientError, createClient } from "./client.ts";
export { addressTranslation, destinationUrl, readMoreUrl, SCRIPTURETIPS } from "./destination.ts";
export { findInText, type ReferenceMatch } from "./find.ts";
export { createScriptureLinks, type ScriptureLinks } from "./instance.ts";
export {
  AUTO_ATTRIBUTE,
  KEY_ATTRIBUTE,
  LINK_CLASS,
  linkReferences,
  OWNER_ATTRIBUTE,
  REF_ATTRIBUTE,
  TEXT_ATTRIBUTE,
  unlink,
  WRITTEN_ATTRIBUTE,
} from "./scan.ts";
export { DEFAULT_STRINGS } from "./strings.ts";
export { createTooltip, type Tooltip, type TooltipOptions } from "./tooltip.ts";
export { chooseTranslation, DEFAULT_TRANSLATION, type TranslationSources } from "./translation.ts";
export type {
  LinksEventName,
  LinksEvents,
  LinksOptions,
  Scheme,
  Strings,
  WidgetPassage,
  WidgetTranslation,
} from "./types.ts";
