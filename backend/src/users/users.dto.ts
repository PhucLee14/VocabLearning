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
import { CONFIRM_ACTIONS, type ConfirmAction } from '../auth/confirm-code.js';
import { CEFR_LEVELS, type CefrLevel } from '../common/cefr.js';
import { IsOptionalNotNull } from '../common/validation.js';

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

export class UpdateProfileDto {
  @IsOptionalNotNull()
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

  @IsOptionalNotNull()
  @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';

  /** IANA timezone, e.g. "Asia/Ho_Chi_Minh" (checked in the service) */
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class UpdateSettingsDto {
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  dailyNewWords?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(240)
  dailyGoalMinutes?: number;

  @IsOptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(500)
  dailyGoalCards?: number;

  @IsOptionalNotNull()
  @IsNumber()
  @Min(0.7)
  @Max(0.97)
  desiredRetention?: number;

  @IsOptionalNotNull()
  @IsBoolean()
  showVietnamese?: boolean;

  @IsOptionalNotNull()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptionalNotNull()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  reminderTime?: string;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(['EMAIL', 'PUSH'], { each: true })
  reminderChannels?: ('EMAIL' | 'PUSH')[];
}

export class ConfirmCodeDto {
  @IsIn(CONFIRM_ACTIONS)
  action: ConfirmAction;
}

export class ChangePasswordDto {
  /** Not needed when the account has no password yet (Google sign-in only): `code` is used instead. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword: string;

  /** The 6-digit code emailed by POST /me/confirm-code (action "set_password"). */
  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;
}

/** Accounts with a password confirm with it; Google-only accounts with an emailed code. */
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  /** The 6-digit code emailed by POST /me/confirm-code (action "delete_account"). */
  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;
}
