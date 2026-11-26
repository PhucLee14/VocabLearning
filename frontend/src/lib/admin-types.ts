// Shapes of the /api/admin/* and /api/feedback responses (backend/src/admin, backend/src/feedback).
import type { CefrLevel } from './types';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminStats {
  users: { total: number; newThisWeek: number; admins: number; disabled: number; activeThisWeek: number };
  words: number;
  topics: number;
  openFeedback: number;
  days: { date: string; learners: number; reviews: number; newWords: number; signUps: number }[];
}

export type Role = 'USER' | 'ADMIN';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerifiedAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  hasPassword: boolean;
  hasGoogle: boolean;
  streak: number;
  lastActiveDate: string | null;
  cards: number;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: 'vi' | 'en';
  timezone: string;
  targetLevel: CefrLevel | null;
  emailVerifiedAt: string | null;
  disabledAt: string | null;
  createdAt: string;
  hasPassword: boolean;
  hasGoogle: boolean;
  streak: { current: number; longest: number; lastActiveDate: string | null };
  counts: { cards: number; reviewLogs: number; notes: number; feedback: number; known: number; due: number };
  sessions: { id: string; userAgent: string | null; createdAt: string; lastUsedAt: string; expiresAt: string }[];
  days: { date: string; reviews: number; newWords: number; activeSeconds: number; goalMet: boolean }[];
}

export interface AdminWordRow {
  id: string;
  slug: string;
  headword: string;
  pos: string;
  senseNo: number;
  cefrLevel: CefrLevel;
  definitionEn: string;
  meaningVi: string | null;
  updatedAt: string;
  learners: number;
  examples: number;
  openReports: number;
}

export interface AdminTopicRef {
  id: string;
  slug: string;
  nameEn: string;
  nameVi: string;
}

export interface AdminWordDetail {
  id: string;
  slug: string;
  headword: string;
  pos: string;
  senseNo: number;
  ipa: string | null;
  cefrLevel: CefrLevel;
  definitionEn: string;
  meaningVi: string | null;
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  audioUrl: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  examples: { sentence: string; translationVi: string | null }[];
  topics: AdminTopicRef[];
  counts: { learners: number; notes: number; reviews: number; openReports: number };
  sameHeadword: {
    id: string;
    slug: string;
    headword: string;
    pos: string;
    senseNo: number;
    cefrLevel: CefrLevel;
    definitionEn: string;
  }[];
}

export interface AdminTopic extends AdminTopicRef {
  descriptionEn: string | null;
  descriptionVi: string | null;
  icon: string | null;
  sortOrder: number;
  parentId: string | null;
  words: number;
}

export interface AdminTopicNode extends AdminTopic {
  children: AdminTopic[];
}

export interface ImportError {
  index: number;
  headword: string;
  message: string;
}

export interface ImportPreview {
  id: string;
  fileName: string;
  totalRows: number;
  creates: number | null;
  updates: number | null;
  invalidRows: number;
  errors: ImportError[];
  errorCount: number;
  sample: {
    slug: string;
    headword: string;
    pos: string;
    sense_no: number;
    cefr_level: string;
    definition_en: string;
    meaning_vi: string | null;
    examples: number;
    topics: string[];
  }[];
  expiresAt: string;
}

export interface ImportJobRow {
  id: string;
  fileName: string;
  status: 'PREVIEW' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  inserted: number;
  updated: number;
  failed: number;
  createdAt: string;
  completedAt: string | null;
  createdBy: { id: string; name: string } | null;
}

export const FEEDBACK_TYPES = ['GENERAL', 'BUG', 'IDEA', 'WORD_MEANING', 'WORD_EXAMPLE', 'WORD_OTHER'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export const FEEDBACK_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'WONT_FIX'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface AdminFeedback {
  id: string;
  type: FeedbackType;
  message: string;
  pagePath: string | null;
  status: FeedbackStatus;
  reply: string | null;
  repliedAt: string | null;
  replySeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string } | null;
  repliedBy: { id: string; name: string } | null;
  word: { id: string; slug: string; headword: string; pos: string; senseNo: number } | null;
}

export interface AdminFeedbackList extends Paged<AdminFeedback> {
  counts: Partial<Record<FeedbackStatus, number>>;
}

export interface MyFeedback {
  id: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  reply: string | null;
  repliedAt: string | null;
  replySeenAt: string | null;
  createdAt: string;
  word: { slug: string; headword: string; pos: string } | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  data: unknown;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}
