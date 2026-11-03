import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CEFR_LEVELS, type CefrLevel } from '../common/cefr.js';

class TopicLevelQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  topic?: string;

  @IsOptional()
  @IsIn(CEFR_LEVELS)
  level?: CefrLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class LearnQueueQuery extends TopicLevelQuery {}

export class PracticeQuery extends TopicLevelQuery {
  /** "learned": only words the learner has started (default). "all": any word. */
  @IsOptional()
  @IsIn(['learned', 'all'])
  source?: 'learned' | 'all';
}

export class ReviewQueueQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class StartCardDto {
  @IsUUID()
  wordId: string;

  /** "learn": add to the review queue. "known": "I already know this", kept out of reviews. */
  @IsIn(['learn', 'known'])
  action: 'learn' | 'known';
}

export class ReviewDto {
  @IsUUID()
  wordId: string;

  /** 1 Again · 2 Hard · 3 Good · 4 Easy */
  @IsInt()
  @Min(1)
  @Max(4)
  rating: 1 | 2 | 3 | 4;

  /** PRACTICE is logged but never changes the schedule. */
  @IsIn(['LEARN', 'REVIEW', 'PRACTICE'])
  mode: 'LEARN' | 'REVIEW' | 'PRACTICE';

  /** Time spent on the card, for study-time stats (capped at 60 s per card). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  durationMs?: number;
}
