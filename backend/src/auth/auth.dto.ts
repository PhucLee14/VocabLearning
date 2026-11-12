import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { LINK_TOKEN_PATTERN } from './email-links.js';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class LinkTokenDto {
  @IsString()
  @Matches(LINK_TOKEN_PATTERN, { message: 'This link is invalid or has expired' })
  token: string;
}

export class ResetPasswordDto extends LinkTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword: string;
}
