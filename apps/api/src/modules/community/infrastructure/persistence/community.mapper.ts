import { Community as PrismaCommunity, Prisma } from '@prisma/client';
import { Community } from '../../domain/community.entity';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors UserMapper (users module precedent).
export class CommunityMapper {
  static toDomain(record: PrismaCommunity): Community {
    return new Community({
      id: record.id,
      name: record.name,
      address: record.address,
      // Prisma's `$Enums.Locale` is a string-literal union with the same
      // values as the hand-written domain `Locale` (design.md Decision 5) —
      // structurally assignable with no cast.
      locale: record.locale,
      deletedAt: record.deletedAt,
    });
  }

  static toPersistence(community: Community): Prisma.CommunityCreateInput {
    return {
      id: community.id,
      name: community.name,
      address: community.address,
      locale: community.locale,
      deletedAt: community.deletedAt,
    };
  }
}
