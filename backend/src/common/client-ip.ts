import type { Request } from 'express';

/**
 * The visitor's IP, for rate limiting only.
 *
 * On Vercel the platform sets `x-vercel-forwarded-for` / `x-forwarded-for`
 * (and overwrites values sent by the client). Requests reach the backend
 * through the frontend's /api rewrite, and the headers still carry the
 * visitor's own IP there (checked in production on 2026-11-14 with
 * `/api/health/db`, which reports it). Per-IP limits are therefore per visitor;
 * per-email and per-account limits back them up.
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
