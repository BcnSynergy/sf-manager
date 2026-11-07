import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { AssignmentAlreadyExistsError } from '../../domain/errors/assignment-already-exists.error';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict.error';
import { PrismaCommunityRepresentativeRepository } from './prisma-community-representative.repository';

// TD-49: @prisma/adapter-pg changed how a Postgres unique violation (23505)
// reaches `error.meta.driverAdapterError.cause.constraint`. 7.9 always sets
// `fields` (quoted column names); 7.10 sets `index` (the constraint name)
// whenever Postgres names it, and `fields` only as a fallback. The table has
// two unique constraints: the (communityId, userId) pair, which means the
// assignment already exists, and the one-active-per-community partial index,
// which means a concurrent activation raced this one (retryable).
const uniqueViolation = (constraint: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { driverAdapterError: { cause: { constraint } } },
  });

const assignment = new CommunityRepresentative({
  id: 'assignment-1',
  communityId: 'community-1',
  userId: 'user-1',
  deactivatedAt: null,
});

const repositoryRejectingWritesWith = (error: unknown) => {
  const prisma = {
    communityRepresentative: {
      create: jest.fn().mockRejectedValue(error),
      update: jest.fn().mockRejectedValue(error),
    },
  };
  return new PrismaCommunityRepresentativeRepository(
    prisma as unknown as PrismaService,
  );
};

describe('PrismaCommunityRepresentativeRepository unique-violation mapping', () => {
  describe('create', () => {
    it('maps the pair constraint reported by name (adapter-pg 7.10) to AssignmentAlreadyExistsError', async () => {
      const repository = repositoryRejectingWritesWith(
        uniqueViolation({
          index: 'CommunityRepresentative_communityId_userId_key',
        }),
      );

      await expect(repository.create(assignment)).rejects.toBeInstanceOf(
        AssignmentAlreadyExistsError,
      );
    });

    it('maps the pair constraint reported by columns (adapter-pg 7.9) to AssignmentAlreadyExistsError', async () => {
      const repository = repositoryRejectingWritesWith(
        uniqueViolation({ fields: ['"communityId"', '"userId"'] }),
      );

      await expect(repository.create(assignment)).rejects.toBeInstanceOf(
        AssignmentAlreadyExistsError,
      );
    });

    it('maps the partial index reported by name (adapter-pg 7.10) to TransactionConflictError', async () => {
      const repository = repositoryRejectingWritesWith(
        uniqueViolation({
          index: 'CommunityRepresentative_one_active_per_community',
        }),
      );

      await expect(repository.create(assignment)).rejects.toBeInstanceOf(
        TransactionConflictError,
      );
    });

    it('maps the partial index reported by columns (adapter-pg 7.9) to TransactionConflictError', async () => {
      const repository = repositoryRejectingWritesWith(
        uniqueViolation({ fields: ['"communityId"'] }),
      );

      await expect(repository.create(assignment)).rejects.toBeInstanceOf(
        TransactionConflictError,
      );
    });

    it('maps a P2002 whose constraint cannot be read to TransactionConflictError', async () => {
      const repository = repositoryRejectingWritesWith(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: {},
        }),
      );

      await expect(repository.create(assignment)).rejects.toBeInstanceOf(
        TransactionConflictError,
      );
    });
  });

  describe('setDeactivatedAt', () => {
    it('maps the partial index reported by name (adapter-pg 7.10) to TransactionConflictError on reactivation', async () => {
      const repository = repositoryRejectingWritesWith(
        uniqueViolation({
          index: 'CommunityRepresentative_one_active_per_community',
        }),
      );

      await expect(
        repository.setDeactivatedAt('community-1', 'user-1', null),
      ).rejects.toBeInstanceOf(TransactionConflictError);
    });
  });
});
