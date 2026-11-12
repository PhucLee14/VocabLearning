import type { Request } from 'express';

/**
 * The visitor's IP, for rate limiting only.
 *
 * On Vercel the platform sets `x-vercel-forwarded-for` / `x-forwarded-for`
 * (and overwrites values sent by the client). Requests reach the backend
 * through the frontend's /api rewrite, so the IP seen here may be a Vercel
 * proxy address instead of the visitor's: `/api/health/db` reports it so this
 * can be checked. IP limits are therefore generous; per-email and per-account
 * limits do the real work.
 */
export function clientIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const header = (name: string) => {
    const value = req.headers[name];
    return (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined;
  };
  return (
    header('x-vercel-forwarded-for') ??
    header('x-forwarded-for') ??
    header('x-real-ip') ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}
