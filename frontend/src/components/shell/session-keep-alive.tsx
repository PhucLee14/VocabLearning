'use client';

import { useEffect } from 'react';

const KEY = 'session-ping';
const EVERY_MS = 12 * 60 * 60 * 1000;

/**
 * Server renders don't extend the session (see server-api.ts), so the browser
 * pings the backend at most every 12 hours; that response carries the
 * refreshed session cookie.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY)) || 0;
    } catch {
      // Storage blocked: ping on every app load.
    }
    if (Date.now() - last < EVERY_MS) return;
    fetch('/api/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) return;
        try {
          localStorage.setItem(KEY, String(Date.now()));
        } catch {
          // Ignore.
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
