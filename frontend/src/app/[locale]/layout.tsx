import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Nunito } from 'next/font/google';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { InlineScript } from '@/components/inline-script';
import { routing } from '@/i18n/routing';
import { themeInitScript } from '@/lib/theme';
import '../globals.css';

// One rounded face for everything. Has a Vietnamese subset, so diacritics stack cleanly.
const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin', 'vietnamese'],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: { default: t('title'), template: `%s · ${t('brand')}` }, description: t('description') };
}

export default async function LocaleLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    // suppressHydrationWarning: the inline script may add data-theme before React hydrates.
    <html
      lang={locale}
      className={`${nunito.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={themeInitScript} />
      </head>
      <body className="min-h-full">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
