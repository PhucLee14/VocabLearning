import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CEFR_LEVELS, type CefrLevel } from '../common/cefr.js';
import { IsOptionalNotNull } from '../common/validation.js';
import { FEEDBACK_STATUSES, FEEDBACK_TYPES, type FeedbackStatus, type FeedbackType } from '../feedback/feedback.dto.js';

/** Page number and size, shared by every admin list. */
export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class AuditQuery extends PageQuery {
  @IsOptional()
  @IsIn(['user', 'word', 'topic', 'feedback', 'import'])
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetId?: string;
}

// ───────────────────────────── Users ─────────────────────────────

export const USER_FILTERS = ['all', 'admins', 'disabled', 'unverified'] as const;

export class ListUsersQuery extends PageQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(USER_FILTERS)
  filter?: (typeof USER_FILTERS)[number];
}

export class UpdateUserDto {
  @IsOptionalNotNull()
  @IsIn(['USER', 'ADMIN'])
  role?: 'USER' | 'ADMIN';

  @IsOptionalNotNull()
  @IsBoolean()
  disabled?: boolean;
}

// ───────────────────────────── Words ─────────────────────────────

export const ADMIN_WORD_SORTS = ['az', 'recent', 'level'] as const;

export class ListAdminWordsQuery extends PageQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(CEFR_LEVELS)
  level?: CefrLevel;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  pos?: string;

  /** Only words with open reports. */
  @IsOptional()
  @IsIn(['1'])
  reported?: '1';

  @IsOptional()
  @IsIn(ADMIN_WORD_SORTS)
  sort?: (typeof ADMIN_WORD_SORTS)[number];
}

export class ExampleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  sentence: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  translationVi?: string | null;
}

const LIST_ITEM = /^[^|]{1,80}$/;

/** Every field of a word an admin can set. Creating also needs headword, pos, cefrLevel and definitionEn (checked by the service). */
export class UpdateWordDto {
  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  headword?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  pos?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(99)
  senseNo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ipa?: string | null;

  @IsOptionalNotNull()
  @IsIn(CEFR_LEVELS)
  cefrLevel?: CefrLevel;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  definitionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  meaningVi?: string | null;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(LIST_ITEM, { each: true })
  synonyms?: string[];

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(LIST_ITEM, { each: true })
  antonyms?: string[];

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(LIST_ITEM, { each: true })
  collocations?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  source?: string | null;

  /** Replaces all examples, in this order. */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ExampleDto)
  examples?: ExampleDto[];

  /** Replaces all topic links. */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  topicIds?: string[];
}

export class MergeWordDto {
  /** The word that stays; the one in the URL is merged into it and deleted. */
  @IsUUID()
  intoId: string;
}

// ───────────────────────────── Topics ─────────────────────────────

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Topic fields. Creating also needs slug, nameEn and nameVi (checked by the service). */
export class UpdateTopicDto {
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(60)
  @Matches(SLUG, { message: 'slug must be lower-case words joined by hyphens' })
  slug?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nameEn?: string;

  @IsOptionalNotNull()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nameVi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionVi?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string | null;

  /** null = a top-level topic. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class ReorderTopicsDto {
  /** The topics under one parent (or the top level), in their new order. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids: string[];
}

// ───────────────────────────── Import ─────────────────────────────

/** About 5,000 enriched rows; the route's body limit is 4 MB. */
export const IMPORT_MAX_CHARS = 3_500_000;
export const IMPORT_MAX_ROWS = 5_000;

export class ImportPreviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName: string;

  @IsIn(['csv', 'json'])
  format: 'csv' | 'json';

  @IsString()
  @MinLength(1)
  @MaxLength(IMPORT_MAX_CHARS)
  content: string;
}

export class ImportCommitDto {
  /** The same file again: the server checks it against the preview's hash. */
  @IsString()
  @MinLength(1)
  @MaxLength(IMPORT_MAX_CHARS)
  content: string;
}

// ───────────────────────────── Feedback ─────────────────────────────

export class ListFeedbackQuery extends PageQuery {
  @IsOptional()
  @IsIn(FEEDBACK_STATUSES)
  status?: FeedbackStatus;

  @IsOptional()
  @IsIn([...FEEDBACK_TYPES, 'WORD'])
  type?: FeedbackType | 'WORD';

  @IsOptional()
  @IsUUID()
  wordId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class UpdateFeedbackDto {
  @IsOptionalNotNull()
  @IsIn(FEEDBACK_STATUSES)
  status?: FeedbackStatus;

  /** Shown to the learner in the app. An empty string removes the reply. */
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(2000)
  reply?: string;

  /** Also email the learner that there is a reply (the email does not contain it). */
  @IsOptionalNotNull()
  @IsBoolean()
  notify?: boolean;
}
