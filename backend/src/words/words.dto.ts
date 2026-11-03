import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CEFR_LEVELS, type CefrLevel } from '../common/cefr.js';

export const WORD_STATUSES = ['all', 'new', 'learned', 'learning', 'known', 'due'] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];

export const WORD_SORTS = ['az', 'level', 'recent', 'due', 'mastery'] as const;
export type WordSort = (typeof WORD_SORTS)[number];

export class ListWordsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  topic?: string;

  @IsOptional()
  @IsIn(CEFR_LEVELS)
  level?: CefrLevel;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  /** Statuses other than "all" need a signed-in user. */
  @IsOptional()
  @IsIn(WORD_STATUSES)
  status?: WordStatus;

  @IsOptional()
  @IsIn(WORD_SORTS)
  sort?: WordSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class SaveNoteDto {
  /** Empty content deletes the note. */
  @IsString()
  @MaxLength(5000)
  content: string;
}
