import { hash, verify } from '@node-rs/argon2';
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { GoogleProfile } from './google.js';
import {
  hashSessionToken,
  newSessionToken,
  SESSION_MAX_AGE_MS,
  SESSION_TOUCH_AFTER_MS,
  SESSION_TTL_MS,
} from './session-cookie.js';

/** The user attached to an authenticated request. */
export type AuthUser = { id: string; email: string; name: string; role: 'USER' | 'ADMIN'; timezone: string };

const AUTH_USER_SELECT = { id: true, email: true, name: true, role: true, timezone: true } as const;

/** Verified when the email is unknown, so a failed sign-in takes as long as a wrong password. */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hash('not-a-real-password'));

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: { name: string; email: string; password: string; locale?: 'vi' | 'en' }) {
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await hash(input.password);
    return this.prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash,
        locale: input.locale ?? 'vi',
        settings: { create: {} },
        streak: { create: {} },
      },
      select: AUTH_USER_SELECT,
    });
  }

  async verifyCredentials(emailInput: string, password: string): Promise<AuthUser> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { ...AUTH_USER_SELECT, passwordHash: true },
    });
    const ok = await verify(user?.passwordHash ?? (await getDummyHash()), password).catch(() => false);
    if (!user || !user.passwordHash || !ok) {
      throw new UnauthorizedException('Wrong email or password');
    }
    const { passwordHash: _omit, ...authUser } = user;
    return authUser;
  }

  /**
   * Signs in (or up) with a verified Google identity:
   * 1. a user already linked to this Google account → that user;
   * 2. else a user with the same email → link Google to it;
   * 3. else a new account (no password; the email counts as verified).
   *
   * Case 2 guards against account pre-hijacking: emails are not verified at
   * sign-up yet, so someone could have registered this address first. When
   * the existing account's email was never verified, Google is the first
   * proof of ownership: its password is cleared and its sessions revoked, so
   * only the Google owner gets in (they can set a new password in Settings).
   */
  async signInWithGoogle(profile: GoogleProfile, locale: 'vi' | 'en'): Promise<AuthUser> {
    if (!profile.emailVerified) throw new UnauthorizedException('Google email is not verified');

    const linked = await this.prisma.user.findUnique({ where: { googleId: profile.sub }, select: AUTH_USER_SELECT });
    if (linked) return linked;

    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: { ...AUTH_USER_SELECT, emailVerifiedAt: true, avatarUrl: true, googleId: true },
    });
    if (existing) {
      if (existing.googleId) {
        // The email belongs to an account linked to a different Google account.
        throw new ConflictException('This email is linked to another Google account');
      }
      const unverified = existing.emailVerifiedAt === null;
      const [user] = await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: existing.id },
          data: {
            googleId: profile.sub,
            emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
            avatarUrl: existing.avatarUrl ?? profile.picture,
            ...(unverified ? { passwordHash: null } : {}),
          },
          select: AUTH_USER_SELECT,
        }),
        ...(unverified
          ? [
              this.prisma.session.updateMany({
                where: { userId: existing.id, revokedAt: null },
                data: { revokedAt: new Date() },
              }),
            ]
          : []),
      ]);
      return user;
    }

    return this.prisma.user.create({
      data: {
        email: profile.email,
        name: (profile.name ?? profile.email.split('@')[0]).slice(0, 80),
        googleId: profile.sub,
        avatarUrl: profile.picture,
        emailVerifiedAt: new Date(),
        locale,
        settings: { create: {} },
        streak: { create: {} },
      },
      select: AUTH_USER_SELECT,
    });
  }

  /** Creates a session and returns the raw token for the cookie. Old sessions of the user are cleaned up. */
  async createSession(userId: string, userAgent?: string) {
    const token = newSessionToken();
    const now = Date.now();
    // Housekeeping without a cron job: drop this user's expired sessions (past
    // their sliding expiry or the absolute max age) and ones revoked more than a
    // week ago (kept briefly for troubleshooting).
    await this.prisma.session.deleteMany({
      where: {
        userId,
        OR: [
          { expiresAt: { lt: new Date(now) } },
          { createdAt: { lt: new Date(now - SESSION_MAX_AGE_MS) } },
          { revokedAt: { lt: new Date(now - 7 * 86_400_000) } },
        ],
      },
    });
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashSessionToken(token),
        userAgent: userAgent?.slice(0, 300),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return token;
  }

  /**
   * Resolves a session token to its user.
   * Sliding expiry: a session used again more than a day after its last use is
   * extended by SESSION_TTL_MS (never beyond SESSION_MAX_AGE_MS after sign-in),
   * and `touched` tells the caller to re-send the cookie. Pass
   * `extend: false` when the response cannot reach the browser (server render).
   */
  async resolveSession(token: string, { extend = true } = {}): Promise<{ user: AuthUser; touched: boolean } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        user: { select: AUTH_USER_SELECT },
      },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
    const hardLimit = session.createdAt.getTime() + SESSION_MAX_AGE_MS;
    if (hardLimit <= now) return null;

    const touched = extend && now - session.lastUsedAt.getTime() > SESSION_TOUCH_AFTER_MS;
    if (touched) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(now), expiresAt: new Date(Math.min(now + SESSION_TTL_MS, hardLimit)) },
      });
    }
    return { user: session.user, touched };
  }

  async revokeSession(token: string) {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Re-checks the password of a signed-in user (403, not 401: the session itself is fine). */
  async assertPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    const ok = user.passwordHash ? await verify(user.passwordHash, password).catch(() => false) : false;
    if (!ok) throw new ForbiddenException('The password is wrong');
  }

  /**
   * Changes the password, or sets a first one for an account that signs in
   * with Google only (then an emailed code is required instead of the current password). Every other
   * browser is signed out.
   */
  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
    keepToken: string | undefined,
    { codeVerified = false } = {},
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (user.passwordHash) await this.assertPassword(userId, currentPassword ?? '');
    // A first password (Google-only account) needs an emailed confirmation code, checked by the caller.
    else if (!codeVerified) throw new ForbiddenException('Confirm with the code sent to your email');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(newPassword) } }),
      this.prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(keepToken ? { tokenHash: { not: hashSessionToken(keepToken) } } : {}),
        },
        data: { revokedAt: new Date() },
      }),
      // A reset link sent before this change must not undo it.
      this.prisma.authToken.updateMany({
        where: { userId, type: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
  }
}
