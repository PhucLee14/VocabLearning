import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const prisma = { $queryRaw: vi.fn() };
  let controller: HealthController;

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('liveness does not query the DB', () => {
    expect(controller.live().status).toBe('ok');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('db check returns ok when the DB responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.db()).resolves.toEqual({ status: 'ok', db: 'ok' });
  });

  it('db check returns 503 when the DB is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'));
    await expect(controller.db()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
