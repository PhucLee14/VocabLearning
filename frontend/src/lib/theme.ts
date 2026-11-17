/**
 * Light/dark theme preference.
 *
 * - "system" (default): nothing stored, no `data-theme` on <html>; CSS follows
 *   prefers-color-scheme.
 * - "light" / "dark": stored in localStorage and set as `data-theme` on <html>.
 *
 * localStorage instead of a cookie keeps every page statically prerendered:
 * reading a cookie in the root layout would make the whole app dynamic.
 */
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'theme';

/**
 * On the landing page a change of theme is not a cut: for this many seconds
 * the page's colours ease over (the `theme-fading` class in globals.css, set
 * by the theme switcher) together with the island behind it (sun and moon
 * trading places, sky, light: components/island/).
 */
export const THEME_FADE_SECONDS = 2.2;

/**
 * Runs synchronously in <head> while the HTML is parsed, before first paint,
 * so a stored preference never flashes the wrong theme.
 * See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
