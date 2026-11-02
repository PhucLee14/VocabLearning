export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

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
