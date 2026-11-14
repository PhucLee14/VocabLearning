import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from '@node-rs/argon2';
import { MailerService } from '../mail/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HOUR, MINUTE, RateLimitService } from '../rate-limit/rate-limit.service.js';
import {
  hashLinkToken,
  type LinkKind,
  linkMail,
  linkUrl,
  newLinkToken,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
} from './email-links.js';
import { publicOrigin } from './google.js';

const INVALID_LINK = 'This link is invalid or has expired';

/**
 * Site-wide cap on verification emails per day. Mail goes through one Gmail
 * account (about 500 recipients a day), and anyone can sign up with any
 * address, so sign-ups alone must not use up the quota that password resets
 * and confirmation codes need. Over the cap, sign-up still works; the user can
 * ask for the link again later from Settings.
 */
export const VERIFY_MAILS_PER_DAY = 200;

/** Email verification and password reset (one-time links, see email-links.ts). */
@Injectable()
export class AccountEmailService {
  private readonly logger = new Logger(AccountEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly limits: RateLimitService,
    private readonly config: ConfigService,
  ) {}

  private origin() {
    return publicOrigin(this.config.get<string>('FRONTEND_URL', 'http://localhost:3300'));
  }

  /** Creates a link token (replacing unused ones of the same kind) and emails it. */
  private async sendLink(user: { id: string; email: string; locale: 'vi' | 'en' }, kind: LinkKind) {
    const type = kind === 'verify' ? 'EMAIL_VERIFY' : 'PASSWORD_RESET';
    const token = newLinkToken();
    const [, created] = await this.prisma.$transaction([
      this.prisma.authToken.updateMany({ where: { userId: user.id, type, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.authToken.create({
        data: {
          userId: user.id,
          type,
          tokenHash: hashLinkToken(token),
          expiresAt: new Date(Date.now() + (kind === 'verify' ? VERIFY_TTL_MS : RESET_TTL_MS)),
        },
        select: { id: true },
      }),
    ]);
    try {
      const url = linkUrl(this.origin(), user.locale, kind, token);
      await this.mailer.send({ to: user.email, ...linkMail(user.locale, kind, url) });
    } catch (error) {
      await this.prisma.authToken.delete({ where: { id: created.id } });
      throw error;
    }
  }

  /**
   * Emails a verification link to a signed-in user (no-op once verified).
   * 429 when this user asks too often, or when the site-wide daily cap is reached.
   */
  async sendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, locale: true, emailVerifiedAt: true },
    });
    if (user.emailVerifiedAt) return;
    await this.limits.consume(
      { bucket: 'verify-send:min', id: userId, limit: 1, windowMs: MINUTE },
      { bucket: 'verify-send:hour', id: userId, limit: 5, windowMs: HOUR },
    );
    // Separate call so requests refused per user above don't count site-wide.
    await this.limits.consume({ bucket: 'verify-send:site', id: 'all', limit: VERIFY_MAILS_PER_DAY, windowMs: 24 * HOUR });
    await this.sendLink(user, 'verify');
  }

  /** After sign-up: send the first link, but never fail the sign-up because of email. */
  async sendVerificationQuietly(userId: string) {
    try {
      await this.sendVerification(userId);
    } catch (error) {
      this.logger.warn(`Verification email not sent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Marks the email verified. 400 when the link is unknown, used or expired. */
  async verifyEmail(token: string) {
    const row = await this.useToken(token, 'EMAIL_VERIFY');
    await this.prisma.user.updateMany({
      where: { id: row.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /**
   * Emails a reset link when an account has this email. Always succeeds from
   * the caller's point of view, so the answer doesn't reveal which emails
   * have accounts; at most 3 emails per address per hour.
   */
  async requestPasswordReset(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const perEmail = await this.limits.hit({ bucket: 'reset-send', id: email, limit: 3, windowMs: HOUR });
    if (!perEmail.allowed) return;
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, locale: true },
    });
    if (!user) return;
    try {
      await this.sendLink(user, 'reset');
    } catch (error) {
      // Same answer as for an unknown email; the failure is in the log.
      this.logger.error(`Reset email not sent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sets a new password from a reset link. The link proves control of the
   * email, so the email counts as verified; every session is signed out.
   */
  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await hash(newPassword);
    const row = await this.useToken(token, 'PASSWORD_RESET');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.user.updateMany({ where: { id: row.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } }),
      this.prisma.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.authToken.updateMany({
        where: { userId: row.userId, type: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: now },
      }),
    ]);
  }

  /** Consumes a valid, unused link token once (a concurrent second use fails). */
  private async useToken(token: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET') {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashLinkToken(token) },
      select: { id: true, userId: true, type: true, usedAt: true, expiresAt: true },
    });
    if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(INVALID_LINK);
    }
    const used = await this.prisma.authToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) throw new BadRequestException(INVALID_LINK);
    return row;
  }
}
