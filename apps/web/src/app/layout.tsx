import type { Metadata } from "next";
import Image from "next/image";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AccountMenu } from "../account/AccountMenu.tsx";
import { currentAccount } from "../account/api.ts";
import { instance } from "../instance.ts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("site");
  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("site");
  const ta = await getTranslations("account");
  const [account, { accountsOpen, contactEmail }] = await Promise.all([
    currentAccount(),
    instance(),
  ]);
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <header className="site-header">
            <a href="/" className="brand">
              <Image src="/brand/logo-48.png" width={48} height={48} alt="" priority />
              <span>{t("name")}</span>
            </a>
            {account ? (
              <AccountMenu
                label={account.handle ? `@${account.handle}` : ta("yourAccount")}
                compilations={account.handle !== null}
              />
            ) : accountsOpen ? (
              // The home page shows its own Sign in button instead (see globals.css).
              <a href="/sign-in" className="account-link sign-in-link">
                {ta("signIn")}
              </a>
            ) : null}
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <a href="/about">{t("about")}</a>
            {contactEmail ? <a href="/contact">{t("contact")}</a> : null}
            <a href="/privacy">{t("privacy")}</a>
            <a href="/terms">{t("terms")}</a>
            <a href="/credits">{t("credits")}</a>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
