import type { ReactNode } from 'react';

/** Camera stops of the island, in page order (see STOPS in scene.tsx). */
export const ISLAND_STOPS = { hero: 0, try: 1, how: 2, levels: 3, topics: 4, close: 5 } as const;

/**
 * One "floor" of the landing page: a screen-high section that the island's
 * camera stops at. Scrolling snaps from floor to floor (globals.css,
 * `html:has([data-island-stop])`).
 *
 * The content sits in a narrow column so the island stays visible:
 * - from 1280px: beside the island, alternating sides from floor to floor
 *   (text left on the 1st, 3rd, … floor on the page, right on the 2nd, 4th,
 *   …; the island is opposite). By order on the page, not by stop number: a
 *   floor that is left out (no data for it) must not leave two floors in a
 *   row on the same side. island.tsx tells the scene the same order;
 * - below that: at the bottom of the screen, under a gap of about a third of
 *   the screen where the island shows.
 *
 * `panel`: "always" (default) draws a panel behind the content; "narrow" only
 * below 1280px (the hero: the island is far enough away not to sit under the
 * text); "never" for content that is a card already.
 */
export function IslandStop({
  stop,
  panel = 'always',
  children,
}: {
  stop: keyof typeof ISLAND_STOPS;
  panel?: 'always' | 'narrow' | 'never';
  children: ReactNode;
}) {
  const index = ISLAND_STOPS[stop];
  const box = {
    always: 'rounded-[22px] border border-line bg-raised p-6 sm:p-8',
    narrow: 'rounded-[22px] border border-line bg-raised p-6 sm:p-8 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0',
    never: '',
  }[panel];
  return (
    <section
      data-island-stop={index}
      className={[
        // pb-16 below 640px: room under the panel for the island's row of buttons (island.tsx).
        'mx-auto flex max-w-[1100px] items-end px-4 pt-[36svh] pb-16 sm:px-6 sm:pb-8 xl:items-center xl:pt-8',
        // The bare part of a floor is where the island is played with: a sideways
        // drag turns it (so the browser only keeps vertical panning and pinch
        // zoom there) and must not select text.
        'touch-pan-y touch-pinch-zoom select-none',
        // Every second floor on the page (the floors are the only sections in <main>).
        'xl:[&:nth-of-type(even)]:justify-end',
        // The first floor shares the first screen with the 4rem site header, which is the snap point there.
        // Its end is one too: the same place while it fits, its end where it is taller (narrow screens),
        // or snapping pulls a scroll to that end back to the top (floor-scroll.ts rests there).
        index === 0 ? 'min-h-[calc(100svh-4rem)] snap-end' : 'min-h-[100svh] snap-start snap-always',
      ].join(' ')}
    >
      {/* data-island-ui: the island ignores the pointer while it is over the content (see overPage in scene.tsx). */}
      <div data-island-ui className={`w-full max-w-[520px] select-text ${box}`}>
        {children}
      </div>
    </section>
  );
}
