import { Body, Controller, ForbiddenException, Get, HttpCode, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { type AuthUser, AuthService } from '../auth/auth.service.js';
import { clearSessionCookie } from '../auth/session-cookie.js';
import { CurrentUser, SessionGuard, SessionToken } from '../auth/session.guard.js';
import { ChangePasswordDto, DeleteAccountDto, UpdateProfileDto, UpdateSettingsDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@Controller('me')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
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

  /** Changes the password and signs out every other browser. */
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @SessionToken() token: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, token);
  }

  /** Deletes the account and all of its data, after re-checking the password. */
  @Post('delete')
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { hasPassword } = await this.users.profile(user.id);
    if (hasPassword) await this.auth.assertPassword(user.id, dto.password ?? '');
    else if ((dto.confirmEmail ?? '').trim().toLowerCase() !== user.email) {
      throw new ForbiddenException('The email does not match');
    }
    await this.users.deleteAccount(user.id);
    clearSessionCookie(res);
  }
}
