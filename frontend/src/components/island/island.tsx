'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFloorWheel } from './floor-scroll';

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
 * The 3D island and its sky behind the page. The page's own sections stay normal HTML and
 * mark themselves with `data-island-stop`; the canvas is fixed behind them,
 * hidden from assistive tech, and ignores the pointer.
 */
export function Island({ topicSlugs, debug = false }: { topicSlugs: string[]; debug?: boolean }) {
  const progress = useRef(0);
  const hud = useRef<HTMLOutputElement>(null);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

  useFloorWheel(reducedMotion);

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

  return (
    <>
      {/* 100lvh, not inset-0: the canvas must not resize when a phone's address bar hides. */}
      <div aria-hidden className="pointer-events-none fixed top-0 left-0 -z-10 h-[100lvh] w-full bg-sky">
        {ready && !lost && (
          <IslandScene
            progress={progress}
            topicSlugs={topicSlugs}
            reducedMotion={reducedMotion}
            onStats={debug ? showStats : undefined}
            onContextLost={() => setLost(true)}
          />
        )}
      </div>
      {debug && (
        <output
          ref={hud}
          aria-hidden
          className="num pointer-events-none fixed right-3 bottom-3 z-10 rounded-full bg-ink px-3 py-1 text-[12px] font-bold text-canvas"
        />
      )}
    </>
  );
}
