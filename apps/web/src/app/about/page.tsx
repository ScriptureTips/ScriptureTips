import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: t("title") };
}

/** What ScriptureTips is, and its promises (vision §1.1). */
export default async function About() {
  const t = await getTranslations("about");
  return (
    <section className="info-page">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <p>{t("now")}</p>
      <p>{t("next")}</p>
      <h2>{t("freeHeading")}</h2>
      <p>{t("free")}</p>
      <h2>{t("softwareHeading")}</h2>
      <p>
        {t.rich("software", {
          source: (chunks) => <a href="https://github.com/adonai-reigns/ScriptureTips">{chunks}</a>,
        })}
      </p>
      <p>{t.rich("credits", { credits: (chunks) => <a href="/credits">{chunks}</a> })}</p>
    </section>
  );
}
