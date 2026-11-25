import { useTranslations } from 'next-intl';
import { Logo } from '@/components/logo';
import { Link } from '@/i18n/navigation';

/**
 * The 404 page, in the visitor's language: for addresses that match no page
 * ([...rest]/page.tsx sends them here) and for a word or topic that doesn't
 * exist (`notFound()` in their pages). It sits above the site header and the
 * app shell, so it brings its own logo; "home" is the landing page, which
 * sends a signed-in visitor on to the dashboard (proxy.ts).
 */
export default function NotFound() {
  const t = useTranslations('Errors');
  return (
    <div className="flex min-h-screen flex-col items-center gap-10 px-4 py-10 sm:py-16">
      <Logo />
      <main className="card w-full max-w-[480px] p-6 sm:p-8">
        <p className="num text-[40px] leading-none font-black text-accent">404</p>
        <h1 className="mt-3 text-[24px] font-extrabold tracking-tight">{t('notFoundTitle')}</h1>
        <p className="mt-2 text-[15px] text-muted">{t('notFoundBody')}</p>
        <Link href="/" className="btn btn-primary mt-6">
          {t('home')}
        </Link>
      </main>
    </div>
  );
}
