import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms");
  return { title: t("title") };
}

/** The terms of use (vision §1.1, §7.2). A draft for the project owner's review. */
export default async function Terms() {
  const t = await getTranslations("terms");
  return (
    <section className="info-page">
      <h1>{t("title")}</h1>
      <p className="info-updated">{t("updated")}</p>
      <p>{t("intro")}</p>
      <h2>{t("freeHeading")}</h2>
      <p>{t("free")}</p>
      <h2>{t("textsHeading")}</h2>
      <p>{t("texts")}</p>
      <h2>{t("softwareHeading")}</h2>
      <p>
        {t.rich("software", {
          agpl: (chunks) => <a href="https://www.gnu.org/licenses/agpl-3.0.html">{chunks}</a>,
        })}
      </p>
      <h2>{t("useHeading")}</h2>
      <p>{t("use")}</p>
      <h2>{t("warrantyHeading")}</h2>
      <p>{t("warranty")}</p>
      <h2>{t("lawHeading")}</h2>
      <p>{t("law")}</p>
      <p>{t.rich("changes", { contact: (chunks) => <a href="/contact">{chunks}</a> })}</p>
    </section>
  );
}
