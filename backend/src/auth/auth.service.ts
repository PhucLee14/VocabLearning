import { hash, verify } from '@node-rs/argon2';
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  hashSessionToken,
  newSessionToken,
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

  /** Creates a session and returns the raw token for the cookie. */
  async createSession(userId: string, userAgent?: string) {
    const token = newSessionToken();
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
   * Resolves a session token to its user. Sliding expiry: a session used again
   * more than a day after its last use is extended by SESSION_TTL_MS, and
   * `touched` tells the caller to re-send the cookie.
   */
  async resolveSession(token: string): Promise<{ user: AuthUser; touched: boolean } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: { id: true, expiresAt: true, lastUsedAt: true, revokedAt: true, user: { select: AUTH_USER_SELECT } },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;

    const touched = now - session.lastUsedAt.getTime() > SESSION_TOUCH_AFTER_MS;
    if (touched) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) },
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

  async changePassword(userId: string, currentPassword: string, newPassword: string, keepToken?: string) {
    await this.assertPassword(userId, currentPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(newPassword) } }),
      // Sign out every other browser.
      this.prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(keepToken ? { tokenHash: { not: hashSessionToken(keepToken) } } : {}),
        },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
