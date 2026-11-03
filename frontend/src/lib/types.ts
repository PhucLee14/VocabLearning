// Shapes returned by the backend (backend/src/**). Dates arrive as ISO strings.

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export type CardState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';
export type Rating = 1 | 2 | 3 | 4;
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

// ───────── Topics ─────────

export interface TopicSummary {
  id: string;
  slug: string;
  nameEn: string;
  nameVi: string;
  _count: { words: number };
}

export interface TopicNode extends TopicSummary {
  icon: string | null;
  children: TopicSummary[];
}

export interface TopicRef {
  slug: string;
  nameEn: string;
  nameVi: string;
}

export interface TopicDetail {
  id: string;
  slug: string;
  nameEn: string;
  nameVi: string;
  descriptionEn: string | null;
  descriptionVi: string | null;
  icon: string | null;
  parent: TopicRef | null;
  children: (TopicRef & { _count: { words: number } })[];
  totalWords: number;
}

// ───────── Words ─────────

export interface WordSummary {
  id: string;
  slug: string;
  headword: string;
  pos: string;
  ipa: string | null;
  cefrLevel: CefrLevel;
  definitionEn: string;
  meaningVi: string | null;
  audioUrl: string | null;
}

export interface Progress {
  state: CardState;
  due: string;
  masteryLevel: number;
  isKnown: boolean;
}

export interface WordListItem extends WordSummary {
  progress: Progress | null;
}

export type WordStatus = 'all' | 'new' | 'learned' | 'learning' | 'known' | 'due';

export interface WordList {
  items: WordListItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<WordStatus, number>> & { all: number };
}

export interface WordDetail extends WordSummary {
  senseNo: number;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  imageUrl: string | null;
  source: string | null;
  examples: { id: string; sentence: string; translationVi: string | null }[];
  topics: (TopicRef & { parentSlug: string | null })[];
  otherSenses: { slug: string; pos: string; senseNo: number; definitionEn: string }[];
  progress:
    | (Progress & { isLeech: boolean; reps: number; lapses: number; lastReviewAt: string | null; recall: number | null })
    | null;
  note: { content: string; updatedAt: string } | null;
  history: { rating: Rating; mode: 'LEARN' | 'REVIEW' | 'PRACTICE' | 'QUIZ'; reviewedAt: string; nextIntervalDays: number }[];
}

// ───────── Study ─────────

export interface CardWord extends WordSummary {
  synonyms: string[];
  examples: { sentence: string; translationVi: string | null }[];
  topics: TopicRef[];
  note?: string | null;
}

export interface CardSummary {
  state: CardState;
  due: string;
  masteryLevel: number;
  isKnown: boolean;
  reps: number;
  lapses: number;
}

export interface StudyItem {
  word: CardWord;
  card: CardSummary | null;
  /** When the card would be due next for each rating. */
  preview: Record<'1' | '2' | '3' | '4', string>;
}

export interface Today {
  date: string;
  newWords: number;
  reviews: number;
  correct: number;
  activeSeconds: number;
  goalMet: boolean;
  goalCards: number;
  goalMinutes: number;
  streak: number;
  longestStreak: number;
}

export interface LearnQueue {
  words: CardWord[];
  distractors: { id: string; headword: string; definitionEn: string }[];
  newToday: number;
  dailyNewWords: number;
}

export interface Summary {
  dueCount: number;
  newAvailable: number;
  learnedCount: number;
  knownCount: number;
  totalWords: number;
  mastery: Record<'0' | '1' | '2' | '3' | '4' | '5', number>;
  forecast: { date: string; count: number }[];
  today: Today;
  recent: (WordSummary & { progress: Pick<Progress, 'masteryLevel' | 'isKnown' | 'due'> })[];
}

export interface ProgressData {
  heatmap: { date: string; count: number; seconds: number; goalMet: boolean }[];
  mastery: Record<'0' | '1' | '2' | '3' | '4' | '5', number>;
  byLevel: { level: CefrLevel; total: number; learned: number; mastered: number }[];
  byTopic: { slug: string; nameEn: string; nameVi: string; total: number; learned: number }[];
  forecast: { date: string; count: number }[];
  weeklyRecall: { week: string; total: number; rate: number }[];
  totals: { reviews: number; seconds: number; learned: number; daysStudied: number };
  today: Today;
}

// ───────── Account ─────────

export interface Profile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  gender: Gender | null;
  birthDate: string | null;
  bio: string | null;
  targetLevel: CefrLevel | null;
  role: 'USER' | 'ADMIN';
  locale: 'vi' | 'en';
  timezone: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface Settings {
  dailyNewWords: number;
  dailyGoalMinutes: number;
  dailyGoalCards: number;
  desiredRetention: number;
  showVietnamese: boolean;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderChannels: ('EMAIL' | 'PUSH')[];
}
