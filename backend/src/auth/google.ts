import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';

/**
 * Sign in with Google: OAuth 2.0 authorization code flow with PKCE, done on
 * the server (no Google JavaScript in the page).
 *
 * The callback URL is on the frontend's origin (`<FRONTEND_URL>/api/auth/google/callback`,
 * proxied to this backend by the Next.js rewrite), so the session cookie set
 * there is first-party. It must be listed under "Authorized redirect URIs" of
 * the OAuth client in Google Cloud.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Short-lived cookie holding the state, PKCE verifier and where to go afterwards. */
export const OAUTH_COOKIE = 'vocab_oauth';
export const OAUTH_COOKIE_PATH = '/api/auth/google';
export const OAUTH_TTL_MS = 10 * 60 * 1000;

export type OAuthPending = { state: string; verifier: string; next: string; locale: 'vi' | 'en' };

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

const base64url = (buf: Buffer) => buf.toString('base64url');

export function newPending(next: string, locale: 'vi' | 'en'): OAuthPending {
  return { state: base64url(randomBytes(24)), verifier: base64url(randomBytes(48)), next, locale };
}

/** PKCE S256 challenge for a verifier. */
export const pkceChallenge = (verifier: string) => base64url(createHash('sha256').update(verifier).digest());

/** Only same-site paths (no "//host" or "/\\host"), so ?next= cannot send the user elsewhere. */
export function safeNext(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) && value.length <= 500 ? value : '/dashboard';
}

export const safeLocale = (value: unknown): 'vi' | 'en' => (value === 'en' ? 'en' : 'vi');

/** The first origin in FRONTEND_URL (it may list several, comma-separated). */
export const publicOrigin = (frontendUrl: string) => frontendUrl.split(',')[0].trim().replace(/\/+$/, '');

export const redirectUri = (origin: string) => `${origin}/api/auth/google/callback`;

export function authorizationUrl(opts: { clientId: string; redirectUri: string; pending: OAuthPending }) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: opts.pending.state,
    code_challenge: pkceChallenge(opts.pending.verifier),
    code_challenge_method: 'S256',
    // Always show the account chooser, so switching Google accounts is easy.
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

/** Exchanges the authorization code for an ID token. */
export async function exchangeCode(opts: {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const res = await (opts.fetchImpl ?? fetch)(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code: opts.code,
      code_verifier: opts.verifier,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !body.id_token) throw new Error(`Google token exchange failed (${res.status} ${body.error ?? ''})`);
  return body.id_token;
}

let googleKeys: JWTVerifyGetKey | undefined;

/** Verifies the ID token's signature (Google's JWKS), issuer, audience and expiry. */
export async function verifyIdToken(idToken: string, clientId: string, keys?: JWTVerifyGetKey): Promise<GoogleProfile> {
  googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  const { payload } = await jwtVerify(idToken, keys ?? googleKeys, { issuer: GOOGLE_ISSUERS, audience: clientId });
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Google ID token has no sub or email');
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  };
}
