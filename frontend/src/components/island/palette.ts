import { useMemo, useSyncExternalStore } from 'react';
import { Color } from 'three';

/**
 * The island's colours come from the CSS design tokens in globals.css, read at
 * runtime, so the 3D scene follows the theme (light / dark / system) like the
 * rest of the UI.
 */
const TOKENS = [
  'raised',
  'sunken',
  'muted',
  'ink',
  'danger',
  'sky',
  'water',
  'sun',
  'moon',
  'line-strong',
  'accent',
  'accent-lip',
  'accent-soft',
  'streak',
  'm0',
  'm1',
  'm2',
  'm3',
  'm4',
  'm5',
] as const;

export interface Palette {
  raised: Color;
  sunken: Color;
  muted: Color;
  ink: Color;
  danger: Color;
  sky: Color;
  water: Color;
  sun: Color;
  moon: Color;
  /** The dark theme is active (forced, or following the OS). */
  dark: boolean;
  lineStrong: Color;
  accent: Color;
  accentLip: Color;
  accentSoft: Color;
  streak: Color;
  /** Mastery ramp m0..m5. */
  mastery: Color[];
}

function readTokens(): string {
  const style = getComputedStyle(document.documentElement);
  // Last entry: the active theme, from the `color-scheme` that globals.css sets with the tokens.
  return [...TOKENS.map((name) => style.getPropertyValue(`--${name}`).trim()), style.colorScheme].join('|');
}

/** Tokens change when the user switches theme (`data-theme` on <html>) or the OS setting changes. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onChange);
  };
}

export function usePalette(): Palette {
  // The snapshot is a string, so it is stable between renders until a token changes.
  const snapshot = useSyncExternalStore(subscribe, readTokens, () => '');
  return useMemo(() => {
    const values = snapshot.split('|');
    const color = (name: (typeof TOKENS)[number]) => new Color(values[TOKENS.indexOf(name)] || '#888888');
    return {
      raised: color('raised'),
      sunken: color('sunken'),
      muted: color('muted'),
      ink: color('ink'),
      danger: color('danger'),
      sky: color('sky'),
      water: color('water'),
      sun: color('sun'),
      moon: color('moon'),
      dark: values[TOKENS.length] === 'dark',
      lineStrong: color('line-strong'),
      accent: color('accent'),
      accentLip: color('accent-lip'),
      accentSoft: color('accent-soft'),
      streak: color('streak'),
      mastery: [color('m0'), color('m1'), color('m2'), color('m3'), color('m4'), color('m5')],
    };
  }, [snapshot]);
}
