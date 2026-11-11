import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const prisma = { $queryRaw: vi.fn() };
  const env: Record<string, string | undefined> = {};
  let controller: HealthController;

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    env.CRON_SECRET = 'cron-secret';
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('liveness does not query the DB', () => {
    expect(controller.live().status).toBe('ok');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('db check returns ok when the DB responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.db('Bearer cron-secret')).resolves.toEqual({ status: 'ok', db: 'ok' });
  });

  it('db check returns 503 when the DB is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'));
    await expect(controller.db('Bearer cron-secret')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('db check is hidden without the secret, so anyone cannot keep the DB awake', async () => {
    await expect(controller.db(undefined)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.db('Bearer wrong')).rejects.toBeInstanceOf(NotFoundException);
    env.CRON_SECRET = undefined;
    await expect(controller.db('Bearer ')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
