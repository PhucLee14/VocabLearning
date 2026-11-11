import { Body, Controller, Get, HttpCode, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { type AuthUser, AuthService } from '../auth/auth.service.js';
import { ConfirmCodeService } from '../auth/confirm-code.service.js';
import { clearSessionCookie } from '../auth/session-cookie.js';
import { CurrentUser, SessionGuard, SessionToken } from '../auth/session.guard.js';
import { ChangePasswordDto, ConfirmCodeDto, DeleteAccountDto, UpdateProfileDto, UpdateSettingsDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@Controller('me')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly codes: ConfirmCodeService,
  ) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.users.profile(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.users.settings(user.id);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.users.updateSettings(user.id, dto);
  }

  /**
   * Emails a 6-digit code that confirms a sensitive action (setting a first
   * password, deleting an account without a password). At most one per minute.
   */
  @Post('confirm-code')
  @HttpCode(204)
  async sendConfirmCode(@CurrentUser() user: AuthUser, @Body() dto: ConfirmCodeDto) {
    await this.codes.send(user.id, dto.action);
  }

  /**
   * Changes the password and signs out every other browser. An account
   * without a password (Google only) confirms with the emailed code instead.
   */
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @SessionToken() token: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const { hasPassword } = await this.users.profile(user.id);
    if (!hasPassword) await this.codes.verify(user.id, 'set_password', dto.code);
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, token, {
      codeVerified: !hasPassword,
    });
  }

  /** Deletes the account and all of its data, after re-checking the password (or an emailed code). */
  @Post('delete')
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { hasPassword } = await this.users.profile(user.id);
    if (hasPassword) await this.auth.assertPassword(user.id, dto.password ?? '');
    else await this.codes.verify(user.id, 'delete_account', dto.code);
    await this.users.deleteAccount(user.id);
    clearSessionCookie(res);
  }
}
