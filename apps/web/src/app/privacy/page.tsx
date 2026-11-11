import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return { title: t("title") };
}

/**
 * The privacy policy (vision §5), for the reader with accounts closed, scripture.tips, the
 * extension and the website plugin. A draft for the project owner's review; it must change
 * before accounts open.
 */
export default async function Privacy() {
  const t = await getTranslations("privacy");
  return (
    <section className="info-page">
      <h1>{t("title")}</h1>
      <p className="info-updated">{t("updated")}</p>
      <p>{t("intro")}</p>
      <h2>{t("collectHeading")}</h2>
      <p>{t("noAccounts")}</p>
      <p>{t("logs")}</p>
      <p>{t("passages")}</p>
      <h2>{t("browserHeading")}</h2>
      <p>{t("browser")}</p>
      <p>{t("extension")}</p>
      <h2>{t("whereHeading")}</h2>
      <p>{t("where")}</p>
      <h2>{t("rightsHeading")}</h2>
      <p>{t.rich("rights", { contact: (chunks) => <a href="/contact">{chunks}</a> })}</p>
      <p>{t("complaints")}</p>
      <p>{t("changes")}</p>
    </section>
  );
}
