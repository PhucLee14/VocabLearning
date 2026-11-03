import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { SESSION_COOKIE } from './lib/session';

const intl = createMiddleware(routing);

/**
 * Pages that need a signed-in user. This is only an optimistic check (is the
 * cookie there?); the backend validates the session on every request, and a
 * stale cookie ends on the sign-in page via lib/server-api.ts.
 * Word pages (/words/<slug>) and topics stay public.
 */
const PROTECTED = /^\/(dashboard|learn|flashcards|progress|settings|profile)(\/|$)|^\/words\/?$/;

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const [, maybeLocale, ...rest] = pathname.split('/');
  const hasLocale = (routing.locales as readonly string[]).includes(maybeLocale);
  if (hasLocale) {
    const path = `/${rest.join('/')}`;
    const signedIn = request.cookies.has(SESSION_COOKIE);

    if (!signedIn && PROTECTED.test(path)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${maybeLocale}/login`;
      url.search = `?next=${encodeURIComponent(path + search)}`;
      return NextResponse.redirect(url);
    }
    // Signed-in visitors skip the landing page.
    if (signedIn && path === '/') {
      const url = request.nextUrl.clone();
      url.pathname = `/${maybeLocale}/dashboard`;
      return NextResponse.redirect(url);
    }
  }
  // Picks the locale (NEXT_LOCALE cookie → Accept-Language → default "vi") and redirects / → /vi
  return intl(request);
}

export const config = {
  // Skip /api, /_next, /_vercel and static files (paths containing a dot)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
