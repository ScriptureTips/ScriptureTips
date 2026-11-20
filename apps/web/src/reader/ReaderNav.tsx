import { getTranslations } from "next-intl/server";
import type { TranslationOption } from "../translations/menu.ts";
import { ReaderMenu } from "./ReaderMenu.tsx";

/**
 * The reader's Translation menu (`ReaderMenu`), under the chapter bar: its button says the
 * abbreviation of the translation shown (`abbreviation`).
 */
export async function ReaderNav({
  limit,
  selected,
  tail,
  abbreviation,
  compilations,
  translations,
}: {
  /** The most translations that may be shown at once (a guest has fewer). */
  limit: number;
  /** The translations shown, in order; the first is the path's. */
  selected: readonly string[];
  /** The path after the translation, for toggling translations on the same passage. */
  tail: string;
  /** On the button: the first translation's abbreviation (and how many more are shown). */
  abbreviation: string;
  compilations: readonly TranslationOption[];
  translations: readonly TranslationOption[];
}) {
  const t = await getTranslations("reader");
  const ts = await getTranslations("search");
  return (
    <ReaderMenu
      limit={limit}
      selected={selected}
      tail={tail}
      compilations={compilations}
      translations={translations}
      labels={{
        translationNav: ts("translation"),
        translation: abbreviation,
        yours: ts("yourCompilations"),
        all: ts("translations"),
        favourites: t("favourites"),
        others: t("otherTranslations"),
        clickToShow: t("clickToShow"),
        everything: t("allTranslations"),
        last: t("lastTranslation"),
        limit: t("translationLimit", { count: limit }),
      }}
    />
  );
}
