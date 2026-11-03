/**
 * Calendar days in the learner's timezone. A "day" is stored as a DATE column,
 * i.e. a JS Date at 00:00 UTC of that calendar day.
 */

/** "YYYY-MM-DD" of `at` in `timeZone`. */
export function localDateKey(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** The DATE value (00:00 UTC) for `at`'s calendar day in `timeZone`. */
export function localDay(at: Date, timeZone: string): Date {
  return new Date(`${localDateKey(at, timeZone)}T00:00:00.000Z`);
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * 86_400_000);
}

export const dayKey = (day: Date) => day.toISOString().slice(0, 10);

export type StreakState = { current: number; longest: number; lastActiveDate: Date | null };

/** The streak after the learner meets today's goal. Idempotent within one day. */
export function advanceStreak(streak: StreakState, today: Date): StreakState {
  const last = streak.lastActiveDate ? dayKey(streak.lastActiveDate) : null;
  if (last === dayKey(today)) return streak;
  const current = last === dayKey(addDays(today, -1)) ? streak.current + 1 : 1;
  return { current, longest: Math.max(streak.longest, current), lastActiveDate: today };
}

/**
 * The streak to display today: it is still alive if the goal was met today or
 * yesterday (today's goal can still be met), otherwise it is broken (0).
 */
export function displayedStreak(streak: StreakState, today: Date): number {
  if (!streak.lastActiveDate) return 0;
  const last = dayKey(streak.lastActiveDate);
  return last === dayKey(today) || last === dayKey(addDays(today, -1)) ? streak.current : 0;
}
