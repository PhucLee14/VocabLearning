import { Body, Controller, Get, Headers, HttpCode, Logger, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { LoginDto, RegisterDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import {
  authorizationUrl,
  exchangeCode,
  newPending,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  OAUTH_TTL_MS,
  type OAuthPending,
  publicOrigin,
  redirectUri,
  safeLocale,
  safeNext,
  verifyIdToken,
} from './google.js';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from './session-cookie.js';
import { CurrentUser, OptionalSessionGuard } from './session.guard.js';
import type { AuthUser } from './auth.service.js';

const oauthCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  // Lax: sent on the top-level redirect back from Google.
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: OAUTH_COOKIE_PATH,
});

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.register(dto);
    setSessionCookie(res, await this.auth.createSession(user.id, userAgent));
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.verifyCredentials(dto.email, dto.password);
    setSessionCookie(res, await this.auth.createSession(user.id, userAgent));
    return { user };
  }

  /**
   * Called by the browser now and then (frontend SessionKeepAlive). The guard
   * extends a session that is due for it and re-sends the cookie, which
   * Server Component requests cannot do.
   */
  @Get('session')
  @UseGuards(OptionalSessionGuard)
  session(@CurrentUser() user?: AuthUser) {
    return { signedIn: Boolean(user) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (token) await this.auth.revokeSession(token);
    clearSessionCookie(res);
  }

  // ───────────── Sign in with Google (src/auth/google.ts) ─────────────

  private google() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const origin = publicOrigin(this.config.get<string>('FRONTEND_URL', 'http://localhost:3300'));
    return { clientId, clientSecret, origin, redirectUri: redirectUri(origin) };
  }

  /** Starts the flow: GET /api/auth/google?next=/dashboard&locale=vi → Google's account chooser. */
  @Get('google')
  startGoogle(@Query('next') next: unknown, @Query('locale') locale: unknown, @Res() res: Response) {
    const g = this.google();
    const pending = newPending(safeNext(next), safeLocale(locale));
    if (!g.clientId || !g.clientSecret) {
      this.logger.warn('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set');
      return res.redirect(302, `${g.origin}/${pending.locale}/login?error=google_unavailable`);
    }
    res.cookie(OAUTH_COOKIE, JSON.stringify(pending), { ...oauthCookieOptions(), maxAge: OAUTH_TTL_MS });
    return res.redirect(302, authorizationUrl({ clientId: g.clientId, redirectUri: g.redirectUri, pending }));
  }

  /** Google sends the user back here with ?code&state (or ?error when they cancel). */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Query('error') error: unknown,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const g = this.google();
    let pending: OAuthPending | null = null;
    try {
      pending = JSON.parse((req.cookies as Record<string, string>)?.[OAUTH_COOKIE] ?? 'null') as OAuthPending | null;
    } catch {
      pending = null;
    }
    res.clearCookie(OAUTH_COOKIE, oauthCookieOptions());
    const locale = safeLocale(pending?.locale);
    const fail = (reason: string) => res.redirect(302, `${g.origin}/${locale}/login?error=${reason}`);

    if (error) return fail('google_cancelled');
    // The state must match the one this browser started with (CSRF / mix-up protection).
    if (!pending || typeof state !== 'string' || state !== pending.state || typeof code !== 'string') {
      return fail('google_failed');
    }
    if (!g.clientId || !g.clientSecret) return fail('google_unavailable');

    try {
      const idToken = await exchangeCode({
        code,
        verifier: pending.verifier,
        clientId: g.clientId,
        clientSecret: g.clientSecret,
        redirectUri: g.redirectUri,
      });
      const profile = await verifyIdToken(idToken, g.clientId);
      if (!profile.emailVerified) return fail('google_unverified');
      const user = await this.auth.signInWithGoogle(profile, locale);
      setSessionCookie(res, await this.auth.createSession(user.id, userAgent));
      return res.redirect(302, `${g.origin}/${locale}${safeNext(pending.next)}`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      this.logger.warn(`Google sign-in failed: ${err instanceof Error ? err.message : String(err)}`);
      return fail(status === 409 ? 'google_conflict' : 'google_failed');
    }
  }
}
