import { useEffect } from 'react';

/** Same breakpoint as the wide layout in stop.tsx / scene.tsx and the mandatory snap in globals.css. */
const WIDE = '(min-width: 1280px)';
/** After a floor change, further wheel input is ignored at least this long. */
const LOCK_MS = 1100;
/**
 * ...and until the wheel has been quiet this long. Trackpad momentum sends a
 * stream of events that can outlast the lock; a pause this short separates it
 * from the next deliberate gesture.
 */
const QUIET_MS = 180;

/** Where the page rests: the top, the top of every later floor, and the very bottom (the footer). */
function restPositions(): number[] {
  const positions = [0];
  for (const floor of document.querySelectorAll<HTMLElement>('[data-island-stop]')) {
    if (floor.dataset.islandStop !== '0') positions.push(Math.round(floor.getBoundingClientRect().top + window.scrollY));
  }
  positions.push(document.documentElement.scrollHeight - window.innerHeight);
  return positions;
}

/**
 * One wheel gesture = one floor, on wide screens.
 *
 * CSS scroll snapping alone returns to the same floor after a single wheel
 * notch (about 100px, less than half a floor), so the wheel is handled here:
 * a notch at rest scrolls smoothly to the next floor, then input is ignored
 * until that gesture (and its momentum) is over. Touch, keyboard and scrollbar
 * scrolling stay native (CSS snap handles them), and so does the wheel inside
 * a floor taller than the screen.
 */
export function useFloorWheel(reducedMotion: boolean) {
  useEffect(() => {
    let lockedUntil = 0;
    let lastWheel = 0;
    let sameGesture = false;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < 2 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (!window.matchMedia(WIDE).matches) return;
      const now = performance.now();
      const quiet = now - lastWheel >= QUIET_MS;
      lastWheel = now;
      // Still the gesture (or its momentum) that already moved a floor.
      if (now < lockedUntil || (sameGesture && !quiet)) {
        event.preventDefault();
        return;
      }
      sameGesture = false;

      const positions = restPositions();
      const at = positions.findIndex((position) => Math.abs(position - window.scrollY) <= 3);
      if (at === -1) return;
      const next = at + Math.sign(event.deltaY);
      if (next < 0 || next >= positions.length) return;
      // A floor taller than the screen scrolls natively until its other end.
      if (Math.abs(positions[next] - positions[at]) > window.innerHeight + 8) return;

      event.preventDefault();
      lockedUntil = now + LOCK_MS;
      sameGesture = true;
      window.scrollTo({ top: positions[next], behavior: reducedMotion ? 'instant' : 'smooth' });
    };
    // Not passive: the handler cancels the native scroll.
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [reducedMotion]);
}
