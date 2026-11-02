import type { routing } from '@/i18n/routing';
import type messages from '../messages/vi.json';

// Type-checks translation keys: a wrong key in t('Home.title') is a TypeScript error
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
