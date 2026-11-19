import type { CanonId } from "@scripturetips/canon";
import { english } from "@scripturetips/reference";
import { getTranslations } from "next-intl/server";
import type { TranslationOption } from "../translations/menu.ts";
import { type AvailableBook, arrangeBooks, type BookSectionId } from "./books.ts";
import { bookSlug, readHref } from "./paths.ts";
import { type MenuSection, ReaderMenu } from "./ReaderMenu.tsx";

/**
 * The reader's horizontal menu (`ReaderMenu`): Old Testament and New Testament, other scriptures
 * where the translation has any, and Translation. A book opens at its first chapter, in the same
 * translations as now (`selected`).
 */
export async function ReaderNav({
  part,
  limit,
  selected,
  tail,
  books,
  canon,
  current,
  compilations,
  translations,
}: {
  /** The book menus' bar, or the Translation dropdown. */
  part: "books" | "translation";
  /** The most translations that may be shown at once (a guest has fewer). */
  limit: number;
  /** The translations shown, in order; the first is the path's. */
  selected: readonly string[];
  /** The path after the translation, for toggling translations on the same passage. */
  tail: string;
  /** The first translation's books; null if they couldn't be had. */
  books: readonly AvailableBook[] | null;
  canon: CanonId | null;
  /** The book being read (OSIS). */
  current?: string | undefined;
  compilations: readonly TranslationOption[];
  translations: readonly TranslationOption[];
}) {
  const t = await getTranslations("reader");
  const ts = await getTranslations("search");
  const arranged = books ? arrangeBooks(books, canon) : [];
  const sectionLabel = (id: BookSectionId) => t(`section.${id}`);
  const group = (id: BookSectionId) => {
    const section = arranged.find((s) => s.id === id);
    return {
      id,
      heading: sectionLabel(id),
      books: (section?.books ?? []).map((b) => ({
        osis: b.osis,
        name: english.name(b.osis, "full", "several"),
        href: readHref(selected, `${bookSlug(b.osis)}/${b.chapters[0] ?? 1}`),
        current: b.osis === current || b.parts.some((p) => p.osis === current),
      })),
    };
  };
  const sections: MenuSection[] = [];
  for (const id of ["ot", "nt"] as const) {
    const g = group(id);
    if (g.books.length > 0)
      sections.push({
        id,
        label: sectionLabel(id),
        groups: [{ id, books: g.books }],
        current: g.books.some((b) => b.current),
      });
  }
  // Books some traditions count, and those none do, together under one menu.
  const others = [group("varies"), group("additional")].filter((g) => g.books.length > 0);
  if (others.length > 0)
    sections.push({
      id: "other",
      label: t("otherScriptures"),
      groups: others.map((g) => (others.length > 1 ? g : { id: g.id, books: g.books })),
      current: others.some((g) => g.books.some((b) => b.current)),
    });
  return (
    <ReaderMenu
      part={part}
      limit={limit}
      sections={sections}
      selected={selected}
      tail={tail}
      compilations={compilations}
      translations={translations}
      labels={{
        nav: t("menuLabel"),
        translationNav: ts("translation"),
        translation: ts("translation"),
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
