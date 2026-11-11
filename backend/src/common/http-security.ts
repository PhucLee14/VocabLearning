import type { NextFunction, Request, Response } from 'express';

/**
 * Request hardening applied to every route (see main.ts).
 *
 * CSRF: the session cookie is SameSite=Lax, which already keeps it off most
 * cross-site requests, but a cross-site *form* POST is a top-level navigation
 * and Express parses form bodies, so e.g. a forged login would work. State-
 * changing requests are therefore refused when:
 * - the browser says they are cross-site (`Sec-Fetch-Site: cross-site`), or
 * - they carry an `Origin` that is not one of FRONTEND_URL's origins, or
 * - they have a body that is not JSON (forms and text/plain can be sent
 *   cross-site without a CORS preflight; our clients only ever send JSON).
 * The Next.js rewrite forwards these headers unchanged, so the check sees the
 * browser's real values.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type CsrfInput = {
  method: string;
  origin?: string;
  contentType?: string;
  secFetchSite?: string;
  hasBody: boolean;
};

/** null when the request is allowed, otherwise the status and reason to refuse it. */
export function checkCsrf(req: CsrfInput, allowedOrigins: readonly string[]): { status: number; message: string } | null {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return null;
  if (req.secFetchSite === 'cross-site') return { status: 403, message: 'Cross-site request refused' };
  if (req.origin && req.origin !== 'null' && !allowedOrigins.includes(req.origin.replace(/\/+$/, ''))) {
    return { status: 403, message: 'Origin not allowed' };
  }
  if (req.origin === 'null') return { status: 403, message: 'Origin not allowed' };
  if (req.hasBody) {
    const type = (req.contentType ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return { status: 415, message: 'Request body must be JSON' };
  }
  return null;
}

export function httpSecurity(allowedOrigins: readonly string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Basic hardening headers for an API that only ever returns JSON.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    const length = Number(req.headers['content-length'] ?? 0);
    const refused = checkCsrf(
      {
        method: req.method,
        origin: req.headers.origin,
        contentType: req.headers['content-type'],
        secFetchSite: req.headers['sec-fetch-site'] as string | undefined,
        hasBody: length > 0 || req.headers['transfer-encoding'] !== undefined,
      },
      allowedOrigins,
    );
    if (refused) {
      res.status(refused.status).json({ statusCode: refused.status, message: refused.message });
      return;
    }
    next();
  };
}
