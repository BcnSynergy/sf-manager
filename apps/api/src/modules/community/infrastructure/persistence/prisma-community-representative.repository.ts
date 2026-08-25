import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { AssignmentAlreadyExistsError } from '../../domain/errors/assignment-already-exists.error';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict.error';
import { CommunityRepresentativeRepository } from '../../application/ports/community-representative.repository.port';
import { CommunityRepresentativeMapper } from './community-representative.mapper';

// Prisma unique-constraint violation code (shared by both unique constraints
// on this table — distinguished below by index name).
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
// Prisma's mapping of a Postgres SERIALIZABLE isolation abort (SQLSTATE
// 40001) — mapped to TransactionConflictError (design.md Decision 2),
// mirroring PrismaUserRepository.transactional.
const SERIALIZATION_FAILURE = 'P2034';
// design.md Decision 2 Gotcha: the hand-written partial unique index
// (migration.sql), invisible to schema.prisma. A P2002 on THIS index is the
// backstop for a concurrent double-activation that slips past SERIALIZABLE
// (or bypasses transactional() entirely) — mapped to TransactionConflictError,
// same as a P2034. A P2002 on the OTHER unique constraint
// (`communityId_userId`, design.md Decision 4) means the caller tried to
// create() a duplicate (communityId, userId) pair — mapped to
// AssignmentAlreadyExistsError instead.
const PARTIAL_INDEX_NAME = 'CommunityRepresentative_one_active_per_community';

// Either the root PrismaService or the interactive-transaction client Prisma
// hands to a $transaction callback — mirrors PrismaUserRepository's
// PrismaClientOrTx (prisma-user.repository.ts:19-23).
type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

// Prisma's P2002 `meta.target` shape varies by provider/constraint kind: a
// named Postgres constraint/index typically comes through as a single
// string, but Prisma's own types allow string[] too — checked explicitly
// (no String(unknown) coercion, which ESLint's no-base-to-string rule
// rightly rejects for a value with no meaningful toString()).
function isUniqueViolationOn(
  error: unknown,
  indexNameFragment: string,
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== UNIQUE_CONSTRAINT_VIOLATION
  ) {
    return false;
  }
  const target = error.meta?.target;
  if (typeof target === 'string') {
    return target.includes(indexNameFragment);
  }
  if (Array.isArray(target)) {
    return target.some(
      (entry) => typeof entry === 'string' && entry.includes(indexNameFragment),
    );
  }
  return false;
}

// Prisma adapter for the CommunityRepresentativeRepository port (ADR-013).
// tasks.md 8.1 (pulled forward into PR 7 to fix a DI-bootstrap defect:
// SoftDeleteCommunityUseCase, added in PR 7, requires this port to be bound
// to a real implementation — the in-memory fake is test-only). Does NOT
// extend SoftDeletableRepository (design.md Decision 3 — deactivatedAt is
// domain state, not an administrative delete).
@Injectable()
export class PrismaCommunityRepresentativeRepository implements CommunityRepresentativeRepository {
  constructor(
    // Explicit @Inject: same rationale as PrismaUserRepository — the
    // constructor parameter's TYPE is a union (PrismaClientOrTx), which
    // Nest's default DI cannot resolve to a single token.
    @Inject(PrismaService) private readonly prisma: PrismaClientOrTx,
  ) {}

  async findByCommunityAndUser(
    communityId: string,
    userId: string,
  ): Promise<CommunityRepresentative | null> {
    const record = await this.prisma.communityRepresentative.findFirst({
      where: { communityId, userId },
    });

    return record ? CommunityRepresentativeMapper.toDomain(record) : null;
  }

  // NULL deactivatedAt = active (design.md Decision 3); at most one row per
  // community satisfies this in practice — enforced by the exclusivity swap
  // (transactional()) plus the partial unique index backstop.
  async findActiveByCommunity(
    communityId: string,
  ): Promise<CommunityRepresentative | null> {
    const record = await this.prisma.communityRepresentative.findFirst({
      where: { communityId, deactivatedAt: null },
    });

    return record ? CommunityRepresentativeMapper.toDomain(record) : null;
  }

  // Active AND deactivated records — Phase 10's list-assignments route.
  async listByCommunity(
    communityId: string,
  ): Promise<CommunityRepresentative[]> {
    const records = await this.prisma.communityRepresentative.findMany({
      where: { communityId },
    });

    return records.map((record) =>
      CommunityRepresentativeMapper.toDomain(record),
    );
  }

  // Multi-community warning (design.md "Where the settled policies live in
  // code") — also reused as-is by the soft-delete cascade (Phase 7, PR 7).
  async countActiveByUser(userId: string): Promise<number> {
    return this.prisma.communityRepresentative.count({
      where: { userId, deactivatedAt: null },
    });
  }

  // Plain insert. A P2002 on the partial index means a concurrent
  // double-activation slipped past SERIALIZABLE -> TransactionConflictError.
  // A P2002 on the (communityId, userId) unique constraint means the pair
  // already has a record, active or deactivated -> AssignmentAlreadyExistsError
  // (design.md Decision 4).
  async create(assignment: CommunityRepresentative): Promise<void> {
    try {
      await this.prisma.communityRepresentative.create({
        data: CommunityRepresentativeMapper.toPersistence(assignment),
      });
    } catch (error) {
      if (isUniqueViolationOn(error, PARTIAL_INDEX_NAME)) {
        throw new TransactionConflictError();
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new AssignmentAlreadyExistsError();
      }
      throw error;
    }
  }

  // NULL = reactivate, a Date = deactivate (design.md Decision 3). Callers
  // (the use cases) always check existence first via
  // findByCommunityAndUser/findActiveByCommunity, mirroring
  // PrismaUserRepository.softDeleteById's lack of a defensive existence
  // check. Reactivation (at: null) can, in principle, hit the partial
  // index's P2002 backstop too -> mapped the same way as create()'s.
  async setDeactivatedAt(
    communityId: string,
    userId: string,
    at: Date | null,
  ): Promise<void> {
    try {
      await this.prisma.communityRepresentative.update({
        where: { communityId_userId: { communityId, userId } },
        data: { deactivatedAt: at },
      });
    } catch (error) {
      if (isUniqueViolationOn(error, PARTIAL_INDEX_NAME)) {
        throw new TransactionConflictError();
      }
      throw error;
    }
  }

  // Runs `work` inside a Postgres SERIALIZABLE transaction (design.md
  // Decision 2) so two concurrent callers activating a representative for
  // the same community can't both observe "no active rep" and both commit
  // (write skew) — mirrors PrismaUserRepository.transactional verbatim
  // (design.md: "copied verbatim from PrismaUserRepository.transactional").
  async transactional<T>(
    work: (repo: CommunityRepresentativeRepository) => Promise<T>,
  ): Promise<T> {
    if (!this.isRootClient(this.prisma)) {
      // Already running inside a transaction (this instance was itself
      // constructed with a tx client by an outer transactional() call) —
      // Prisma does not support nested interactive transactions.
      return work(this);
    }

    try {
      return await this.prisma.$transaction(
        (tx) => work(new PrismaCommunityRepresentativeRepository(tx)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // A raw P2034 surfaces here when the transaction COMMIT itself aborts
      // (not from within `work` — create()/setDeactivatedAt() above already
      // map their own P2002s to domain errors before they'd reach this
      // catch, so `work`'s rejections pass through unchanged via the
      // `throw error` below).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === SERIALIZATION_FAILURE
      ) {
        throw new TransactionConflictError();
      }
      throw error;
    }
  }

  private isRootClient(client: PrismaClientOrTx): client is PrismaService {
    return typeof (client as PrismaService).$transaction === 'function';
  }
}
