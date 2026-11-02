import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Picks the locale (NEXT_LOCALE cookie → Accept-Language → default "vi") and redirects / → /vi
export default createMiddleware(routing);

export const config = {
  // Skip /api, /_next, /_vercel and static files (paths containing a dot)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
