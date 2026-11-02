'use client';

import { useTranslations } from 'next-intl';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, THEMES, type Theme } from '@/lib/theme';

// --- Tiny external store over localStorage, shared by every switcher instance ---

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system'; // storage blocked (private mode, disabled site data)
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisted, but still applied for this page view.
  }
  applyTheme(theme);
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  // Keep other tabs in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(readTheme());
    notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

// The server cannot know the stored value; it renders "system" and React
// switches to the real value right after hydration without a mismatch error.
const getServerSnapshot = (): Theme => 'system';

// --- Component ---

export function ThemeSwitcher() {
  const t = useTranslations('ThemeSwitcher');
  const current = useSyncExternalStore(subscribe, readTheme, getServerSnapshot);

  // In development, Strict Mode's remount resets <html> attributes, dropping
  // the one the inline script set. Re-apply it before paint (no-op in production).
  useLayoutEffect(() => applyTheme(readTheme()), []);

  return (
    <div role="group" aria-label={t('label')} className="seg">
      {THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          title={t(theme)}
          aria-label={t(theme)}
          aria-pressed={current === theme}
          onClick={() => setTheme(theme)}
          className="px-2"
        >
          <ThemeIcon theme={theme} />
        </button>
      ))}
    </div>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (theme === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (theme === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
