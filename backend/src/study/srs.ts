import { type Card, type Grade, fsrs, Rating, State } from 'ts-fsrs';
import type { CardState } from '../generated/prisma/client.js';

/** The scheduling fields of a stored UserCard (see prisma/schema.prisma). */
export type StoredCard = {
  state: CardState;
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReviewAt: Date | null;
};

const STATE_TO_FSRS: Record<CardState, State> = {
  NEW: State.New,
  LEARNING: State.Learning,
  REVIEW: State.Review,
  RELEARNING: State.Relearning,
};
const FSRS_TO_STATE: Record<State, CardState> = {
  [State.New]: 'NEW',
  [State.Learning]: 'LEARNING',
  [State.Review]: 'REVIEW',
  [State.Relearning]: 'RELEARNING',
};

export const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;

export const newStoredCard = (now: Date): StoredCard => ({
  state: 'NEW',
  due: now,
  stability: 0,
  difficulty: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  lastReviewAt: null,
});

function toFsrs(card: StoredCard, now: Date): Card {
  const elapsed = card.lastReviewAt
    ? Math.max(0, Math.floor((now.getTime() - card.lastReviewAt.getTime()) / 86_400_000))
    : 0;
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: elapsed,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_FSRS[card.state],
    last_review: card.lastReviewAt ?? undefined,
  };
}

function fromFsrs(card: Card): StoredCard {
  return {
    state: FSRS_TO_STATE[card.state],
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewAt: card.last_review ?? null,
  };
}

export const scheduler = (desiredRetention: number) =>
  fsrs({ request_retention: desiredRetention, enable_fuzz: true });

/** Applies a rating (1 Again · 2 Hard · 3 Good · 4 Easy). */
export function review(card: StoredCard, rating: Grade, now: Date, desiredRetention: number): StoredCard {
  return fromFsrs(scheduler(desiredRetention).next(toFsrs(card, now), now, rating).card);
}

/** When the card would be due next for each rating, for the labels on the rating buttons. */
export function previewDue(card: StoredCard, now: Date, desiredRetention: number): Record<1 | 2 | 3 | 4, Date> {
  const preview = scheduler(desiredRetention).repeat(toFsrs(card, now), now);
  return {
    1: preview[Rating.Again].card.due,
    2: preview[Rating.Hard].card.due,
    3: preview[Rating.Good].card.due,
    4: preview[Rating.Easy].card.due,
  };
}

/** Recall probability now (0..1), from FSRS retrievability. null before the first review. */
export function recallProbability(card: StoredCard, now: Date, desiredRetention: number): number | null {
  if (card.state === 'NEW' || !card.lastReviewAt) return null;
  return scheduler(desiredRetention).get_retrievability(toFsrs(card, now), now, false);
}

/**
 * Mastery level (PLAN.md §3.6):
 * 0 New · 1 Learning · 2 Recognised (≤ 3 days) · 3 Familiar (4–10) · 4 Proficient (11–30) · 5 Long-term (> 30).
 * A word marked "I already know this" counts as long-term memory.
 */
export function masteryLevel(card: Pick<StoredCard, 'state' | 'scheduledDays'> & { isKnown?: boolean }): number {
  if (card.isKnown) return 5;
  if (card.state === 'NEW' || card.state === 'LEARNING' || card.state === 'RELEARNING') return 1;
  const days = card.scheduledDays;
  if (days <= 3) return 2;
  if (days <= 10) return 3;
  if (days <= 30) return 4;
  return 5;
}

/** A word forgotten this many times is flagged as a leech. */
export const LEECH_LAPSES = 4;
