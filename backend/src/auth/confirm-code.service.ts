import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { MailerService } from '../mail/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CODE_TTL_MS,
  type ConfirmAction,
  codeMail,
  codeMatches,
  hashCode,
  MAX_ATTEMPTS,
  newCode,
  RESEND_AFTER_MS,
} from './confirm-code.js';

/** Emails and checks the 6-digit confirmation codes (see confirm-code.ts). */
@Injectable()
export class ConfirmCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async send(userId: string, action: ConfirmAction) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, locale: true },
    });
    const last = await this.prisma.authToken.findFirst({
      where: { userId, type: 'ACTION_CONFIRM', action },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < RESEND_AFTER_MS) {
      throw new HttpException('Wait a minute before asking for another code', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = newCode();
    const [, token] = await this.prisma.$transaction([
      // A new code replaces any earlier one for the same action.
      this.prisma.authToken.updateMany({
        where: { userId, type: 'ACTION_CONFIRM', action, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          type: 'ACTION_CONFIRM',
          action,
          tokenHash: hashCode(userId, action, code),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
        select: { id: true },
      }),
    ]);
    try {
      await this.mailer.send({ to: user.email, ...codeMail(user.locale, user.name, action, code) });
    } catch (error) {
      // Not delivered: drop the code so the learner can ask again right away.
      await this.prisma.authToken.delete({ where: { id: token.id } });
      throw error;
    }
  }

  /** Throws 403 unless `code` is the current, unused code for this user and action; consumes it. */
  async verify(userId: string, action: ConfirmAction, code: string | undefined) {
    const token = await this.prisma.authToken.findFirst({
      where: { userId, type: 'ACTION_CONFIRM', action, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.attempts >= MAX_ATTEMPTS) {
      throw new ForbiddenException('The code has expired. Ask for a new one.');
    }
    if (!code || !codeMatches(token.tokenHash, userId, action, code)) {
      await this.prisma.authToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
      throw new ForbiddenException('Wrong code');
    }
    // Consume it (the usedAt condition makes a concurrent second use fail).
    const used = await this.prisma.authToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) throw new ForbiddenException('The code has expired. Ask for a new one.');
  }
}
