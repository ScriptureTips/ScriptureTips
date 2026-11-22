import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentAccount } from "../../account/api.ts";
import { AnnotationsBoard } from "../../annotations/AnnotationsBoard.tsx";
import { myCompilations } from "../../compilations/api.ts";
import { translations } from "../../reader/api.ts";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("annotations"))("title") };
}

/**
 * The signed-in user's links and annotations, by collection (vision §3.7.2, domain-model §3.6): the
 * translations and the user's compilations are the wordings words are selected in.
 */
export default async function Annotations() {
  const account = await currentAccount();
  if (!account) redirect("/sign-in");
  const [mine, all] = await Promise.all([
    myCompilations().catch(() => []),
    translations().catch(() => []),
  ]);
  return (
    <AnnotationsBoard
      compilations={mine.map((c) => ({
        slug: c.slug,
        abbreviation: c.abbreviation,
        title: c.title,
        base: c.base.id,
      }))}
      translations={all.map((t) => ({ id: t.id, abbreviation: t.abbreviation, name: t.name }))}
    />
  );
}
