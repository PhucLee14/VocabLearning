import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountEmailService, VERIFY_MAILS_PER_DAY } from './account-email.service.js';

const user = { id: 'user-1', email: 'stranger@example.com', locale: 'vi' as const, emailVerifiedAt: null };
const tooMany = () => new HttpException({ statusCode: 429, retryAfterS: 3600 }, 429);

describe('AccountEmailService verification emails', () => {
  const prisma = {
    user: { findUniqueOrThrow: vi.fn() },
    authToken: { updateMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  };
  const mailer = { send: vi.fn() };
  const limits = { consume: vi.fn(), hit: vi.fn() };
  const config = { get: vi.fn((_key: string, fallback?: string) => fallback) };
  const service = new AccountEmailService(prisma as never, mailer as never, limits as never, config as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUniqueOrThrow.mockResolvedValue(user);
    prisma.$transaction.mockResolvedValue([{ count: 0 }, { id: 'token-1' }]);
    limits.consume.mockResolvedValue(undefined);
    mailer.send.mockResolvedValue(undefined);
  });

  it('checks the per-user limits first, then the site-wide daily cap, then sends', async () => {
    await service.sendVerification('user-1');

    expect(limits.consume).toHaveBeenCalledTimes(2);
    expect(limits.consume.mock.calls[0].map((r: { bucket: string }) => r.bucket)).toEqual([
      'verify-send:min',
      'verify-send:hour',
    ]);
    expect(limits.consume.mock.calls[1][0]).toMatchObject({
      bucket: 'verify-send:site',
      limit: VERIFY_MAILS_PER_DAY,
      windowMs: 24 * 60 * 60 * 1000,
    });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send.mock.calls[0][0].text.startsWith('Chào bạn,')).toBe(true);
  });

  it('does not count a request refused per user against the site-wide cap', async () => {
    limits.consume.mockRejectedValueOnce(tooMany());
    await expect(service.sendVerification('user-1')).rejects.toBeInstanceOf(HttpException);
    expect(limits.consume).toHaveBeenCalledTimes(1);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('sends nothing over the daily cap (429), and sign-up swallows it', async () => {
    limits.consume.mockResolvedValueOnce(undefined).mockRejectedValueOnce(tooMany());
    await expect(service.sendVerification('user-1')).rejects.toMatchObject({ status: 429 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();

    limits.consume.mockResolvedValueOnce(undefined).mockRejectedValueOnce(tooMany());
    await expect(service.sendVerificationQuietly('user-1')).resolves.toBeUndefined();
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
