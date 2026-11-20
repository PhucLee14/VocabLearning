import { useEffect } from 'react';

/** After a floor change, further wheel input is ignored at least this long. */
const LOCK_MS = 1100;
/**
 * ...and until the wheel has been quiet this long. Trackpad momentum sends a
 * stream of events that can outlast the lock; a pause this short separates it
 * from the next deliberate gesture.
 */
const QUIET_MS = 180;
/** How far from a resting place the page may be and still count as resting there (rounding, snapping). */
const SLACK = 3;

/**
 * A place where the page rests: one scroll position, or a stretch of them.
 * A floor a little taller than the screen whose content still shows whole is
 * one stretch (scroll snapping may leave the page anywhere in it).
 * `free`: a floor much taller than the screen lies between this place and the
 * previous one, and is scrolled through natively.
 */
type Rest = { from: number; to: number; free?: boolean };

/**
 * Where the page rests, top to bottom: every floor (the first one at the very
 * top, with the site header), then the very bottom (the footer).
 *
 * A floor taller than the screen whose content would be cut off at its top
 * gets two places, its top and its end. Before 2026-11-19 every floor had only
 * its top, and a floor just a few pixels taller than the screen trapped the
 * wheel: the native scroll it was left to went past the floor's end, scroll
 * snapping pulled the page back to that end, which was no known place, so the
 * next notch was left to native scrolling again.
 */
function restingPlaces(): Rest[] {
  const view = window.innerHeight;
  const y = window.scrollY;
  const places: Rest[] = [];
  for (const floor of document.querySelectorAll<HTMLElement>('[data-island-stop]')) {
    const box = floor.getBoundingClientRect();
    const top = floor.dataset.islandStop === '0' ? 0 : Math.round(box.top + y);
    const end = Math.max(top, Math.round(box.bottom + y) - view);
    const content = floor.firstElementChild?.getBoundingClientRect();
    const contentEnd = content ? Math.round(content.bottom + y) : top;
    if (contentEnd <= top + view) places.push({ from: top, to: end });
    else places.push({ from: top, to: top }, { from: end, to: end, free: end - top > view });
  }
  const bottom = document.documentElement.scrollHeight - view;
  const last = places.at(-1);
  if (last && bottom <= last.to + SLACK) last.to = Math.max(last.to, bottom);
  else places.push({ from: bottom, to: bottom });
  return places;
}

/**
 * One wheel gesture = one floor.
 *
 * CSS scroll snapping alone returns to the same floor after a single wheel
 * notch (about 100px, less than half a floor), so the wheel is handled here:
 * a notch at rest scrolls smoothly to the next resting place, then input is
 * ignored until that gesture (and its momentum) is over. Touch, keyboard and
 * scrollbar scrolling stay native (CSS snap handles them), and so does the
 * wheel inside a floor much taller than the screen.
 *
 * On every screen width: below 1280px the snapping is only "proximity", but it
 * still pulled a single notch back to the floor it came from.
 */
export function useFloorWheel(reducedMotion: boolean) {
  useEffect(() => {
    let lockedUntil = 0;
    let lastWheel = 0;
    let sameGesture = false;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < 2 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const now = performance.now();
      const quiet = now - lastWheel >= QUIET_MS;
      lastWheel = now;
      // Still the gesture (or its momentum) that already moved a floor.
      if (now < lockedUntil || (sameGesture && !quiet)) {
        event.preventDefault();
        return;
      }
      sameGesture = false;

      const places = restingPlaces();
      const y = window.scrollY;
      const at = places.findIndex((place) => y >= place.from - SLACK && y <= place.to + SLACK);
      // Inside a floor much taller than the screen: native scrolling.
      if (at === -1) return;
      const step = Math.sign(event.deltaY);
      const next = at + step;
      if (next < 0 || next >= places.length) return;
      // Into a floor much taller than the screen: native scrolling through it.
      if ((step > 0 ? places[next] : places[at]).free) return;

      event.preventDefault();
      lockedUntil = now + LOCK_MS;
      sameGesture = true;
      window.scrollTo({ top: places[next].from, behavior: reducedMotion ? 'instant' : 'smooth' });
    };
    // Not passive: the handler cancels the native scroll.
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [reducedMotion]);
}
