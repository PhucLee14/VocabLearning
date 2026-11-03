import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CEFR_LEVELS, type CefrLevel } from '../common/cefr.js';

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  /** null = prefer not to say */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number] | null;

  /** "YYYY-MM-DD", or null to clear */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(300)
  bio?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(CEFR_LEVELS)
  targetLevel?: CefrLevel | null;

  @IsOptional()
  @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';

  /** IANA timezone, e.g. "Asia/Ho_Chi_Minh" (checked in the service) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  dailyNewWords?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  dailyGoalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  dailyGoalCards?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.7)
  @Max(0.97)
  desiredRetention?: number;

  @IsOptional()
  @IsBoolean()
  showVietnamese?: boolean;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  reminderTime?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(['EMAIL', 'PUSH'], { each: true })
  reminderChannels?: ('EMAIL' | 'PUSH')[];
}

export class ChangePasswordDto {
  /** Not needed when the account has no password yet (Google sign-in only). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword: string;
}

/** Accounts with a password confirm with it; Google-only accounts type their email instead. */
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  confirmEmail?: string;
}
