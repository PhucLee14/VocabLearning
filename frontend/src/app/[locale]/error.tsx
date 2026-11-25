'use client';

import { ErrorView } from '@/components/error-view';

/**
 * An error in the site header or the app shell themselves ((site)/layout.tsx,
 * (app)/layout.tsx): their own error.tsx can't catch it, so this one shows the
 * error on its own, with the logo. Errors in [locale]/layout.tsx end in
 * app/global-error.tsx.
 */
export default function LocaleError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} standalone />;
}
