import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { InspectableElement } from '../../domain/inspectable-element.entity';
import { ElementCodeAlreadyExistsError } from '../../domain/errors/element-code-already-exists.error';
import { PrismaInspectableElementRepository } from './prisma-inspectable-element.repository';

// TD-49: @prisma/adapter-pg changed how a Postgres unique violation (23505)
// reaches `error.meta.driverAdapterError.cause.constraint`. 7.9 always sets
// `fields` (quoted column names); 7.10 sets `index` (the constraint name)
// whenever Postgres names it, and `fields` only as a fallback. create() must
// map a `code` collision to ElementCodeAlreadyExistsError under both shapes,
// so the create use case's regenerate-and-retry loop keeps working.
const uniqueViolation = (constraint: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { driverAdapterError: { cause: { constraint } } },
  });

const element = new InspectableElement({
  id: 'element-1',
  communityId: 'community-1',
  elementType: 'EXTINGUISHER',
  name: 'Lobby extinguisher',
  description: null,
  location: 'Lobby',
  installedAt: new Date('2026-01-01'),
  serialNumber: null,
  deletedAt: null,
  code: 'ABC123',
  deactivatedAt: null,
});

const repositoryRejectingCreateWith = (error: unknown) => {
  const prisma = {
    inspectableElement: { create: jest.fn().mockRejectedValue(error) },
  };
  return new PrismaInspectableElementRepository(
    prisma as unknown as PrismaService,
  );
};

describe('PrismaInspectableElementRepository.create unique-violation mapping', () => {
  it('maps a code collision reported by constraint name (adapter-pg 7.10) to ElementCodeAlreadyExistsError', async () => {
    const repository = repositoryRejectingCreateWith(
      uniqueViolation({ index: 'InspectableElement_code_key' }),
    );

    await expect(repository.create(element)).rejects.toBeInstanceOf(
      ElementCodeAlreadyExistsError,
    );
  });

  it('maps a code collision reported by columns (adapter-pg 7.9) to ElementCodeAlreadyExistsError', async () => {
    const repository = repositoryRejectingCreateWith(
      uniqueViolation({ fields: ['"code"'] }),
    );

    await expect(repository.create(element)).rejects.toBeInstanceOf(
      ElementCodeAlreadyExistsError,
    );
  });

  it('rethrows a P2002 on any other constraint unchanged', async () => {
    const original = uniqueViolation({ index: 'InspectableElement_other_key' });
    const repository = repositoryRejectingCreateWith(original);

    await expect(repository.create(element)).rejects.toBe(original);
  });

  it('rethrows a P2002 whose constraint cannot be read unchanged', async () => {
    const original = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test', meta: {} },
    );
    const repository = repositoryRejectingCreateWith(original);

    await expect(repository.create(element)).rejects.toBe(original);
  });
});
