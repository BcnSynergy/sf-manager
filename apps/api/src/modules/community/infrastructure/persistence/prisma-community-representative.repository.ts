import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { AssignmentAlreadyExistsError } from '../../domain/errors/assignment-already-exists.error';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict.error';
import { CommunityRepresentativeRepository } from '../../application/ports/community-representative.repository.port';
import { CommunityRepresentativeMapper } from './community-representative.mapper';

// Prisma unique-constraint violation code (shared by both unique constraints
// on this table — distinguished below by which columns were violated).
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
// Prisma's mapping of a Postgres SERIALIZABLE isolation abort (SQLSTATE
// 40001) — mapped to TransactionConflictError (design.md Decision 2),
// mirroring PrismaUserRepository.transactional.
const SERIALIZATION_FAILURE = 'P2034';
// The plain (communityId, userId) unique constraint (design.md Decision 4).
// A P2002 whose violated columns match exactly these two means the caller
// tried to create() a duplicate pair -> AssignmentAlreadyExistsError.
const PLAIN_PAIR_COLUMNS = ['communityId', 'userId'];

// Either the root PrismaService or the interactive-transaction client Prisma
// hands to a $transaction callback — mirrors PrismaUserRepository's
// PrismaClientOrTx (prisma-user.repository.ts:19-23).
type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

// Fresh-context review (2nd pass) Bug 1 finding, verified empirically
// against real Postgres: under Prisma 7 with the @prisma/adapter-pg driver
// adapter, `error.meta.target` is NEVER populated for P2002s on this table
// (neither for the plain @@unique Prisma knows about from schema.prisma,
// nor for the hand-written partial index it doesn't) — the violated
// constraint's columns instead come through under
// `error.meta.driverAdapterError.cause.constraint.fields` (quoted column
// names, e.g. `"communityId"`), because the driver adapter reports the raw
// Postgres error rather than Prisma's own precomputed `target`. Narrowed
// step-by-step (no `any`) to satisfy `no-unsafe-member-access`.
function extractViolatedConstraintFields(error: unknown): string[] | undefined {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== UNIQUE_CONSTRAINT_VIOLATION
  ) {
    return undefined;
  }
  const meta: unknown = error.meta;
  if (typeof meta !== 'object' || meta === null) {
    return undefined;
  }
  const driverAdapterError = (meta as Record<string, unknown>)
    .driverAdapterError;
  if (typeof driverAdapterError !== 'object' || driverAdapterError === null) {
    return undefined;
  }
  const cause = (driverAdapterError as Record<string, unknown>).cause;
  if (typeof cause !== 'object' || cause === null) {
    return undefined;
  }
  const constraint = (cause as Record<string, unknown>).constraint;
  if (typeof constraint !== 'object' || constraint === null) {
    return undefined;
  }
  const fields = (constraint as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) {
    return undefined;
  }
  return fields
    .filter((field): field is string => typeof field === 'string')
    .map((field) => field.replace(/"/g, ''));
}

function isUniqueConstraintViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

// This table has exactly 2 unique constraints (design.md Decision 2 /
// Decision 4), so the check is inverted per the fresh-context review's fix
// direction: only a P2002 whose violated columns demonstrably match BOTH
// plain-pair columns is treated as a duplicate-pair violation. Every OTHER
// P2002 on this table — including the hand-written partial index, and any
// case where the driver-adapter shape above can't be read at all — is
// treated as the partial-index/exclusivity-race case. This is the safer
// default: it maps to a 409 the caller should retry (TransactionConflictError)
// rather than silently mislabeling a genuine race as a permanent
// "already exists" (AssignmentAlreadyExistsError), which would incorrectly
// tell the caller to reactivate instead of retrying.
function isPlainPairViolation(error: unknown): boolean {
  const fields = extractViolatedConstraintFields(error);
  if (!fields) {
    return false;
  }
  return (
    fields.length === PLAIN_PAIR_COLUMNS.length &&
    PLAIN_PAIR_COLUMNS.every((column) => fields.includes(column))
  );
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
      if (isUniqueConstraintViolation(error)) {
        throw isPlainPairViolation(error)
          ? new AssignmentAlreadyExistsError()
          : new TransactionConflictError();
      }
      throw error;
    }
  }

  // NULL = reactivate, a Date = deactivate (design.md Decision 3). Callers
  // (the use cases) always check existence first via
  // findByCommunityAndUser/findActiveByCommunity, mirroring
  // PrismaUserRepository.softDeleteById's lack of a defensive existence
  // check. Reactivation (at: null) can hit the partial index's P2002
  // backstop when another representative is already active for the
  // community -> mapped the same way as create()'s (a P2002 here can never
  // legitimately be the plain-pair constraint, since communityId/userId are
  // the update's WHERE key, not its SET — but the same helper is reused for
  // consistency and as a defensive fallback rather than assuming and
  // letting a raw PrismaClientKnownRequestError leak past this layer).
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
      if (isUniqueConstraintViolation(error)) {
        throw isPlainPairViolation(error)
          ? new AssignmentAlreadyExistsError()
          : new TransactionConflictError();
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
