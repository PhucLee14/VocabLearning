'use client';

import { X, ZoomIn, ZoomOut } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { setTheme } from '@/components/theme-switcher';
import { Link } from '@/i18n/navigation';
import { CEFR_LEVELS } from '@/lib/types';
import { useFloorWheel } from './floor-scroll';
import { PARTS_OF_SPEECH, requestZoom, ZOOM_STEPS } from './parts';
import type { SceneLabels } from './scene';

// three.js and the scene load in their own chunk, on the client only.
const IslandScene = dynamic(() => import('./scene'), { ssr: false });

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * Scroll progress in "stops". Each `[data-island-stop="n"]` section names its
 * camera stop; the progress is n while that section is centred in the viewport
 * and moves evenly to the next section's number in between. A page may leave a
 * stop out (e.g. no topics when the API is down).
 */
function readProgress(): number {
  const middle = window.innerHeight / 2;
  let previous: { centre: number; stop: number } | null = null;
  for (const section of document.querySelectorAll<HTMLElement>('[data-island-stop]')) {
    const rect = section.getBoundingClientRect();
    const current = { centre: rect.top + rect.height / 2, stop: Number(section.dataset.islandStop) };
    if (current.centre >= middle) {
      if (!previous) return current.stop;
      const between = (middle - previous.centre) / (current.centre - previous.centre);
      return previous.stop + (current.stop - previous.stop) * between;
    }
    previous = current;
  }
  return previous?.stop ?? 0;
}

/**
 * The 3D island and its sky behind the page. The page's own sections stay
 * normal HTML and mark themselves with `data-island-stop`; the canvas is fixed
 * behind them and hidden from assistive tech.
 *
 * The island can be played with (scene.tsx listens on the window, the canvas
 * itself takes no pointer events): drag sideways to turn it, click the sun or
 * moon, the windmill, the canoe, the lake, the campfire, the birds; houses and
 * level flags show a label; a double click zooms in on a spot. Three small
 * pieces of HTML belong to that: the label that follows the pointer, the
 * count of hidden mushrooms found, and the zoom buttons.
 */
export function Island({ debug = false }: { debug?: boolean }) {
  const t = useTranslations('Island');
  const landing = useTranslations('Landing');
  const progress = useRef(0);
  const hud = useRef<HTMLOutputElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [mushrooms, setMushrooms] = useState<{ found: number; total: number } | null>(null);
  const [zoomStep, setZoomStep] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

  useFloorWheel(reducedMotion);

  const labels = useMemo<SceneLabels>(
    () => ({
      houses: PARTS_OF_SPEECH.map((part) => t(`pos_${part}`)),
      levels: CEFR_LEVELS.map((level) => `${level} · ${landing(`level_${level}`)}`),
      toNight: t('toNight'),
      toDay: t('toDay'),
    }),
    [t, landing],
  );

  // Load the scene once the page is idle, so it never competes with first paint.
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const update = () => {
      // Lab aid: `#p=2.5` pins the progress (used for still screenshots).
      const pinned = /^#p=([\d.]+)$/.exec(window.location.hash);
      progress.current = pinned ? Number(pinned[1]) : readProgress();
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);

  const showStats = useCallback((text: string) => {
    if (hud.current) hud.current.textContent = text;
  }, []);

  /** The label follows the pointer: written straight to the element, not through React state. */
  const showLabel = useCallback((text: string | null, x: number, y: number) => {
    const element = tip.current;
    if (!element) return;
    if (!text) {
      element.style.display = 'none';
      return;
    }
    element.textContent = text;
    element.style.display = 'block';
    // Above the pointer, kept inside the window.
    const left = Math.max(8, Math.min(window.innerWidth - element.offsetWidth - 8, x - element.offsetWidth / 2));
    element.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(8, y - 46))}px)`;
  }, []);

  const onMushroom = useCallback((found: number, total: number) => setMushrooms({ found, total }), []);
  const onToggleTheme = useCallback((toDark: boolean) => setTheme(toDark ? 'dark' : 'light'), []);
  const onContextLost = useCallback(() => setLost(true), []);

  return (
    <>
      {/* 100lvh, not inset-0: the canvas must not resize when a phone's address bar hides. */}
      {/* bg-sky shows until the scene has loaded; after that the scene draws its own sky (and fades it on a theme change). */}
      <div aria-hidden className="pointer-events-none fixed top-0 left-0 -z-10 h-[100lvh] w-full bg-sky">
        {ready && !lost && (
          <IslandScene
            progress={progress}
            reducedMotion={reducedMotion}
            labels={labels}
            onLabel={showLabel}
            onMushroom={onMushroom}
            onToggleTheme={onToggleTheme}
            onZoom={setZoomStep}
            onStats={debug ? showStats : undefined}
            onContextLost={onContextLost}
          />
        )}
      </div>

      {/* The label of what the pointer is over. Decoration: the same facts are in the page's text. */}
      <div
        ref={tip}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-20 hidden rounded-full bg-ink px-3 py-1.5 text-[13px] font-extrabold whitespace-nowrap text-canvas"
      />

      {mushrooms && (
        <div role="status" data-island-ui className="fixed bottom-4 left-1/2 z-20 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2">
          {mushrooms.found < mushrooms.total ? (
            <p className="pill pill-accent">{t('mushrooms', mushrooms)}</p>
          ) : (
            <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
              <p className="max-w-[34ch] text-[14px] font-bold">{t('mushroomsAll', { total: mushrooms.total })}</p>
              <Link href="/register" className="btn btn-primary btn-sm">
                {landing('ctaPrimary')}
              </Link>
              <button type="button" className="btn btn-ghost btn-sm px-2" aria-label={t('dismiss')} onClick={() => setMushrooms(null)}>
                <X size={16} strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Zoom: the wheel is taken (it moves from floor to floor), so there are buttons; a double click on the island zooms too. */}
      {ready && !lost && (
        <div data-island-ui className="fixed right-4 bottom-4 z-20 flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm px-2.5"
            aria-label={t('zoomIn')}
            title={t('zoomIn')}
            disabled={zoomStep >= ZOOM_STEPS.length - 1}
            onClick={() => requestZoom(1)}
          >
            <ZoomIn size={18} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm px-2.5"
            aria-label={t('zoomOut')}
            title={t('zoomOut')}
            disabled={zoomStep === 0}
            onClick={() => requestZoom(-1)}
          >
            <ZoomOut size={18} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      )}

      {debug && (
        <output
          ref={hud}
          aria-hidden
          className="num pointer-events-none fixed right-16 bottom-4 z-10 rounded-full bg-ink px-3 py-1 text-[12px] font-bold text-canvas"
        />
      )}
    </>
  );
}
