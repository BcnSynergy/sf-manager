import { User as PrismaUser, Prisma } from '@prisma/client';
import { User } from '../../domain/user.entity';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — no ad hoc inline mapping scattered across
// PrismaUserRepository.
export class UserMapper {
  static toDomain(record: PrismaUser): User {
    return new User({
      id: record.id,
      email: record.email,
      passwordHash: record.passwordHash,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt,
    });
  }

  // Shared create/update payload shape. PrismaUserRepository.save() omits
  // `id` from the UPDATE branch of its upsert (design.md Interfaces/
  // Contracts) so the existing row's identity is preserved — this mapper
  // always includes `id`; excluding it for the update path is the
  // repository's responsibility, not the mapper's.
  static toPersistence(user: User): Prisma.UserCreateInput {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      deletedAt: user.deletedAt,
    };
  }
}
