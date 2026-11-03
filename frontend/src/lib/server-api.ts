import 'server-only';
import { cookies } from 'next/headers';
import { locale as rootLocale } from 'next/root-params';
import { cache } from 'react';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { API_URL } from './api';
import { SESSION_COOKIE } from './session';
import type { Profile, Settings } from './types';

/**
 * Data access for the signed-in user (Server Components only).
 *
 * Server Components call the backend directly, so the browser's session
 * cookie is forwarded by hand. Reading cookies() makes the caller dynamic:
 * render it inside <Suspense>.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`GET ${path} → ${status}`);
  }
}

async function authedFetch(path: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return fetch(`${API_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}),
    },
  });
}

async function currentLocale() {
  const value = await rootLocale();
  return routing.locales.includes(value as (typeof routing.locales)[number])
    ? (value as (typeof routing.locales)[number])
    : routing.defaultLocale;
}

/** GET as the signed-in user. Redirects to the sign-in page when the session is missing or expired. */
export async function userGet<T>(path: string, nextPath?: string): Promise<T> {
  const res = await authedFetch(path);
  if (res.status === 401) {
    const locale = await currentLocale();
    redirect({ href: nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login', locale });
  }
  if (!res.ok) throw new ApiError(res.status, path);
  return (await res.json()) as T;
}

/** GET that also works signed out: the backend personalises it when the session is valid. 404 → null. */
export async function optionalUserGet<T>(path: string): Promise<T | null> {
  const res = await authedFetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, path);
  return (await res.json()) as T;
}

/** The signed-in user, or null. Never redirects (used by the app shell). */
export const getViewer = cache(async (): Promise<Profile | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await authedFetch('/me');
  if (!res.ok) return null;
  return (await res.json()) as Profile;
});

export const getSettings = cache(() => userGet<Settings>('/me/settings'));

/** Cards due now (sidebar and bottom-bar badge, shared by both in one render). */
export const getDueCount = cache(async () => {
  if (!(await getViewer())) return 0;
  const data = await optionalUserGet<{ totalDue: number }>('/study/review?limit=1').catch(() => null);
  return data?.totalDue ?? 0;
});
