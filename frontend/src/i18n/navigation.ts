import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware wrappers around the Next.js Link/router (add the /vi or /en prefix)
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
