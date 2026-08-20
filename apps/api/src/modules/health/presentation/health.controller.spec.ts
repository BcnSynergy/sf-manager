import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns ok when the database is reachable', async () => {
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'ok',
    });
  });
});
