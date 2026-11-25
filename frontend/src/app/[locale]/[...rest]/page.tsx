import { notFound } from 'next/navigation';

/**
 * Any address under /vi or /en that matches no page. Without this route Next
 * shows its own unstyled, English-only 404; with it, [locale]/not-found.tsx
 * shows ours, in the visitor's language.
 */
export default function UnknownPage() {
  notFound();
}
