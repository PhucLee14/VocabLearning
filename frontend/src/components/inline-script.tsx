'use client';

/**
 * A script that runs while the server HTML is parsed, before first paint.
 *
 * React warns when a client render produces a <script> (it would never run).
 * So the server renders type="text/javascript" (the browser executes it) and the
 * client renders type="text/plain" (inert); suppressHydrationWarning accepts the
 * difference. Pattern from
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
