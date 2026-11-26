'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/client-api';

/**
 * Runs an admin API call behind a confirm() question, then refreshes the
 * server-rendered page. `error` holds the API's message (or null).
 */
export function useAdminAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run<T>(fn: () => Promise<T>, opts: { confirm?: string; done?: (result: T) => string | null; then?: (result: T) => void } = {}) {
    if (opts.confirm && !window.confirm(opts.confirm)) return;
    start(async () => {
      setError(null);
      setNotice(null);
      try {
        const result = await fn();
        setNotice(opts.done?.(result) ?? null);
        if (opts.then) opts.then(result);
        else router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : String(err));
      }
    });
  }

  return { run, pending, error, notice, setError };
}
