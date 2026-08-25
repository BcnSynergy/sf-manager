import {
  CommunityRepresentative as PrismaCommunityRepresentative,
  Prisma,
} from '@prisma/client';
import { CommunityRepresentative } from '../../domain/community-representative.entity';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors CommunityMapper (community.mapper.ts).
// tasks.md 8.1 (pulled forward into PR 7 to fix the DI-bootstrap defect: PR
// 7's SoftDeleteCommunityUseCase needs a real
// CommunityRepresentativeRepository implementation, not just the port).
export class CommunityRepresentativeMapper {
  static toDomain(
    record: PrismaCommunityRepresentative,
  ): CommunityRepresentative {
    return new CommunityRepresentative({
      id: record.id,
      communityId: record.communityId,
      userId: record.userId,
      deactivatedAt: record.deactivatedAt,
    });
  }

  static toPersistence(
    representative: CommunityRepresentative,
  ): Prisma.CommunityRepresentativeCreateInput {
    return {
      id: representative.id,
      communityId: representative.communityId,
      userId: representative.userId,
      deactivatedAt: representative.deactivatedAt,
    };
  }
}
