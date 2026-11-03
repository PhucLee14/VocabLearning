import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';

/**
 * Sign-in sessions.
 *
 * The browser keeps a random token in an httpOnly cookie; the database keeps
 * only its SHA-256 hash (table `sessions`). Every authenticated request looks
 * the hash up, so a session can be revoked at once (sign out, password change).
 *
 * Why not JWT + refresh token: Server Components cannot set cookies, so an
 * expired access token could not be refreshed during server rendering. A
 * database-backed session needs no refresh step, and the lookup is one indexed
 * query against a database in the same region.
 */
export const SESSION_COOKIE = 'vocab_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend a session (and re-send the cookie) at most once per day. */
export const SESSION_TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;

export const newSessionToken = () => randomBytes(32).toString('base64url');

export const hashSessionToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Lax: sent on top-level navigations, never on cross-site POSTs (CSRF).
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
