'use client';

import { ErrorView } from '@/components/error-view';

/** An error on an app page: shown inside the app shell, so the navigation stays usable. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
