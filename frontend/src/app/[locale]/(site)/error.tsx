'use client';

import { ErrorView } from '@/components/error-view';

/** An error on a public page: shown under the site header, which stays usable. */
export default function SiteError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
