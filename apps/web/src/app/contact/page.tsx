import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { instance } from "../../instance.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contact");
  return { title: t("title") };
}

/** How to reach this instance's operator: its own address (`CONTACT_EMAIL`), or not found. */
export default async function Contact() {
  const { contactEmail } = await instance();
  if (!contactEmail) notFound();
  const t = await getTranslations("contact");
  return (
    <section className="info-page">
      <h1>{t("title")}</h1>
      <p>
        {t.rich("text", {
          address: contactEmail,
          email: (chunks) => <a href={`mailto:${contactEmail}`}>{chunks}</a>,
        })}
      </p>
      <p>{t("copyright")}</p>
    </section>
  );
}
