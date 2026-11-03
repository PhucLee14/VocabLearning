import { Rating } from 'ts-fsrs';
import { addDays, advanceStreak, displayedStreak, localDateKey, localDay } from './days.js';
import { masteryLevel, newStoredCard, previewDue, recallProbability, review } from './srs.js';

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe('local days', () => {
  it('uses the learner timezone, not UTC', () => {
    // 18:30 UTC on 1 Nov is already 01:30 on 2 Nov in Vietnam (UTC+7).
    const at = new Date('2026-11-01T18:30:00Z');
    expect(localDateKey(at, 'Asia/Ho_Chi_Minh')).toBe('2026-11-02');
    expect(localDateKey(at, 'Europe/London')).toBe('2026-11-01');
    expect(localDay(at, 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });
});

describe('streaks', () => {
  const empty = { current: 0, longest: 0, lastActiveDate: null };

  it('starts, continues, and is idempotent within a day', () => {
    const d1 = advanceStreak(empty, day('2026-11-01'));
    expect(d1).toEqual({ current: 1, longest: 1, lastActiveDate: day('2026-11-01') });
    expect(advanceStreak(d1, day('2026-11-01'))).toBe(d1);
    expect(advanceStreak(d1, day('2026-11-02'))).toMatchObject({ current: 2, longest: 2 });
  });

  it('restarts after a missed day but keeps the longest', () => {
    const s = { current: 5, longest: 7, lastActiveDate: day('2026-11-01') };
    expect(advanceStreak(s, day('2026-11-03'))).toMatchObject({ current: 1, longest: 7 });
  });

  it('shows a streak as alive until the end of the next day', () => {
    const s = { current: 4, longest: 4, lastActiveDate: day('2026-11-01') };
    expect(displayedStreak(s, day('2026-11-01'))).toBe(4);
    expect(displayedStreak(s, day('2026-11-02'))).toBe(4);
    expect(displayedStreak(s, day('2026-11-03'))).toBe(0);
    expect(displayedStreak(empty, day('2026-11-03'))).toBe(0);
  });

  it('adds days', () => {
    expect(addDays(day('2026-12-31'), 1).toISOString().slice(0, 10)).toBe('2027-01-01');
  });
});

describe('mastery levels', () => {
  it('follows PLAN.md §3.6', () => {
    expect(masteryLevel({ state: 'NEW', scheduledDays: 0 })).toBe(1);
    expect(masteryLevel({ state: 'RELEARNING', scheduledDays: 0 })).toBe(1);
    expect(masteryLevel({ state: 'REVIEW', scheduledDays: 3 })).toBe(2);
    expect(masteryLevel({ state: 'REVIEW', scheduledDays: 4 })).toBe(3);
    expect(masteryLevel({ state: 'REVIEW', scheduledDays: 30 })).toBe(4);
    expect(masteryLevel({ state: 'REVIEW', scheduledDays: 31 })).toBe(5);
    expect(masteryLevel({ state: 'NEW', scheduledDays: 0, isKnown: true })).toBe(5);
  });
});

describe('FSRS scheduling', () => {
  const now = new Date('2026-11-02T10:00:00Z');

  it('moves a new card forward and grows the interval with good ratings', () => {
    let card = review(newStoredCard(now), Rating.Good, now, 0.9);
    expect(card.state).not.toBe('NEW');
    expect(card.reps).toBe(1);
    expect(card.due.getTime()).toBeGreaterThan(now.getTime());

    // Review each time it falls due: the interval keeps growing.
    let last = 0;
    for (let i = 0; i < 4; i++) {
      const at = card.due;
      card = review(card, Rating.Good, at, 0.9);
      const interval = card.due.getTime() - at.getTime();
      expect(interval).toBeGreaterThanOrEqual(last);
      last = interval;
    }
    expect(card.state).toBe('REVIEW');
    expect(card.scheduledDays).toBeGreaterThan(3);
  });

  it('counts a lapse when a review card is forgotten', () => {
    let card = review(newStoredCard(now), Rating.Easy, now, 0.9);
    expect(card.state).toBe('REVIEW');
    card = review(card, Rating.Again, card.due, 0.9);
    expect(card.lapses).toBe(1);
    expect(card.state).toBe('RELEARNING');
  });

  it('previews a later due date for better ratings', () => {
    const p = previewDue(newStoredCard(now), now, 0.9);
    expect(p[1].getTime()).toBeLessThanOrEqual(p[3].getTime());
    expect(p[3].getTime()).toBeLessThanOrEqual(p[4].getTime());
  });

  it('has no recall probability before the first review', () => {
    expect(recallProbability(newStoredCard(now), now, 0.9)).toBeNull();
    const card = review(newStoredCard(now), Rating.Easy, now, 0.9);
    const p = recallProbability(card, addDays(now, 1), 0.9);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
