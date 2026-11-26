import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const FEEDBACK_TYPES = ['GENERAL', 'BUG', 'IDEA', 'WORD_MEANING', 'WORD_EXAMPLE', 'WORD_OTHER'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export const WORD_FEEDBACK_TYPES: readonly FeedbackType[] = ['WORD_MEANING', 'WORD_EXAMPLE', 'WORD_OTHER'];

export const FEEDBACK_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'WONT_FIX'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export class CreateFeedbackDto {
  @IsIn(FEEDBACK_TYPES)
  type: FeedbackType;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  message: string;

  /** Required for the WORD_* types. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  wordSlug?: string;

  /** The page the learner was on: a path only, no host or query. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/[^?#\s]*$/)
  pagePath?: string;
}
