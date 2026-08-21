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
}
