'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
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
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return <Icon size={16} strokeWidth={2} aria-hidden />;
}
