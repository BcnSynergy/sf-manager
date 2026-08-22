import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import { UserRepository } from '../../application/ports/user.repository.port';
import { User } from '../../domain/user.entity';
import { UserMapper } from './user.mapper';

// Prisma adapter for the UserRepository port (ADR-013). Extends
// SoftDeletableRepository (PR 1) so the ADR-010 `deletedAt: null` default
// filter is enforced by construction, not reimplemented here.
@Injectable()
export class PrismaUserRepository
  extends SoftDeletableRepository
  implements UserRepository
{
  constructor(private readonly prisma: PrismaService) {
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

  // --- Compile bridge only (PR 5 -> PR 6). tasks.md Phase 6 (6.1)
  // implements these for real against Postgres — unique-violation mapping,
  // the ADR-010 default filter, and the SERIALIZABLE `$transaction` (P2034
  // -> 409). PR 5 extended the UserRepository port (design.md Interfaces/
  // Contracts) with these members; without a stub here the whole-project
  // typecheck fails because this class `implements UserRepository`. No test
  // in this repository exercises these stubs: unit tests use
  // InMemoryUserRepository (PR 5), and the Prisma-backed coverage for these
  // methods lands with their real implementation in PR 6.
  findById(): Promise<User | null> {
    throw new Error(
      'PrismaUserRepository.findById is not implemented yet — see tasks.md Phase 6',
    );
  }

  findAll(): Promise<User[]> {
    throw new Error(
      'PrismaUserRepository.findAll is not implemented yet — see tasks.md Phase 6',
    );
  }

  create(): Promise<void> {
    throw new Error(
      'PrismaUserRepository.create is not implemented yet — see tasks.md Phase 6',
    );
  }

  updateById(): Promise<void> {
    throw new Error(
      'PrismaUserRepository.updateById is not implemented yet — see tasks.md Phase 6',
    );
  }

  softDeleteById(): Promise<void> {
    throw new Error(
      'PrismaUserRepository.softDeleteById is not implemented yet — see tasks.md Phase 6',
    );
  }

  countActiveByRole(): Promise<number> {
    throw new Error(
      'PrismaUserRepository.countActiveByRole is not implemented yet — see tasks.md Phase 6',
    );
  }

  transactional<T>(): Promise<T> {
    throw new Error(
      'PrismaUserRepository.transactional is not implemented yet — see tasks.md Phase 6',
    );
  }
}
