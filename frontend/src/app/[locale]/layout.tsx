import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { InlineScript } from '@/components/inline-script';
import { SiteHeader } from '@/components/site-header';
import { routing } from '@/i18n/routing';
import { themeInitScript } from '@/lib/theme';
import '../globals.css';

// Body text. Designed for Vietnamese, so diacritics stack cleanly.
const beVietnam = Be_Vietnam_Pro({
  variable: '--font-be-vietnam',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
});

// Titles, labels, badges and numbers. Has a Vietnamese subset too.
const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin', 'vietnamese'],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('title'), description: t('description') };
}

export default async function LocaleLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'Footer' });

  return (
    // suppressHydrationWarning: the inline script may add data-theme before React hydrates.
    <html
      lang={locale}
      className={`${beVietnam.variable} ${jetbrains.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={themeInitScript} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-line">
            <p className="mx-auto max-w-[1160px] px-4 py-6 font-mono text-xs text-muted">
              {t('note')}
            </p>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
