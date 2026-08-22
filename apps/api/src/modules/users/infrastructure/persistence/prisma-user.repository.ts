import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import { UserRepository } from '../../application/ports/user.repository.port';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict.error';
import { Role } from '../../domain/role';
import { User } from '../../domain/user.entity';
import { UserMapper } from './user.mapper';

// Prisma unique-constraint violation (schema.prisma: `email` is a plain
// @unique column) — mapped to EmailAlreadyInUseError (design.md Decision 8).
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
// Prisma's mapping of a Postgres SERIALIZABLE isolation abort (SQLSTATE
// 40001) — mapped to TransactionConflictError (design.md Decision 3).
const SERIALIZATION_FAILURE = 'P2034';

// Either the root PrismaService or the interactive-transaction client Prisma
// hands to a $transaction callback. Both expose the same model delegates
// (`.user.*`) that this repository actually calls — only $transaction()
// itself (used to detect the root client, see isRootClient()) differs.
type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

// Prisma adapter for the UserRepository port (ADR-013). Extends
// SoftDeletableRepository (PR 1) so the ADR-010 `deletedAt: null` default
// filter is enforced by construction, not reimplemented here.
@Injectable()
export class PrismaUserRepository
  extends SoftDeletableRepository
  implements UserRepository
{
  constructor(
    // Explicit @Inject: the constructor parameter's TYPE is a union
    // (PrismaClientOrTx) so Nest's default reflect-metadata-based DI (which
    // needs a single concrete class per parameter) cannot resolve it —
    // @Inject(PrismaService) pins the injection token regardless of the
    // declared type. transactional() below constructs this class directly
    // (not through Nest's container) with a Prisma.TransactionClient, which
    // never goes through this decorator.
    @Inject(PrismaService) private readonly prisma: PrismaClientOrTx,
  ) {
    super();
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({
      where: this.withDefaultFilter({ email }),
    });

    return record ? UserMapper.toDomain(record) : null;
  }

  // Upsert by unique email (design.md Interfaces/Contracts). On the UPDATE
  // path the `id` field is deliberately omitted from the payload so the
  // existing row's identity is preserved (ADR-009) — a fresh id generated
  // by the caller (e.g. seed.ts on every run) never overwrites it.
  async save(user: User): Promise<void> {
    const { id, ...updateData } = UserMapper.toPersistence(user);

    await this.prisma.user.upsert({
      where: { email: user.email },
      create: { id, ...updateData },
      update: updateData,
    });
  }

  // Same default deletedAt: null filter as findByEmail (design.md
  // Interfaces/Contracts) — a soft-deleted user resolves to null.
  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({
      where: this.withDefaultFilter({ id }),
    });

    return record ? UserMapper.toDomain(record) : null;
  }

  // Soft-deleted users are EXCLUDED — no flag, no options arg (design.md
  // Decision 10), exactly like findByEmail's default filter.
  async findAll(): Promise<User[]> {
    const records = await this.prisma.user.findMany({
      where: this.withDefaultFilter({}),
    });

    return records.map((record) => UserMapper.toDomain(record));
  }

  // Plain insert (design.md Decision 8) — distinct from save()'s upsert. A
  // unique-email violation surfaces as EmailAlreadyInUseError, never a
  // silent overwrite of an existing user's role or password hash.
  async create(user: User): Promise<void> {
    try {
      await this.prisma.user.create({
        data: UserMapper.toPersistence(user),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new EmailAlreadyInUseError();
      }
      throw error;
    }
  }

  async updateById(
    id: string,
    changes: { email?: string; role?: Role },
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: changes,
    });
  }

  // Sets deletedAt (ADR-010) — no row deletion.
  async softDeleteById(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async countActiveByRole(role: Role): Promise<number> {
    return this.prisma.user.count({
      where: this.withDefaultFilter({ role }),
    });
  }

  // Runs `work` inside a Postgres SERIALIZABLE transaction (design.md
  // Decision 3) so two concurrent callers each demoting/deactivating one of
  // the last two SYSTEM_ADMIN users can't both observe "one admin left" and
  // both commit (write skew). `work` receives a repository bound to the
  // transaction client so every call inside the callback participates in
  // the same transaction. A rejected `work` rolls back (Prisma's
  // $transaction behavior); a serialization abort (P2034) surfaces as
  // TransactionConflictError instead of a raw Prisma error leaking out of
  // the infrastructure layer.
  async transactional<T>(
    work: (repo: UserRepository) => Promise<T>,
  ): Promise<T> {
    if (!this.isRootClient(this.prisma)) {
      // Already running inside a transaction (this instance was itself
      // constructed with a tx client by an outer transactional() call) —
      // Prisma does not support nested interactive transactions, so just
      // run the callback against this same transactional repository.
      return work(this);
    }

    try {
      return await this.prisma.$transaction(
        (tx) => work(new PrismaUserRepository(tx)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
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
