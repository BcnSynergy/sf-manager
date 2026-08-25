import {
  CommunityTechnician as PrismaCommunityTechnician,
  Prisma,
} from '@prisma/client';
import { CommunityTechnician } from '../../domain/community-technician.entity';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors CommunityRepresentativeMapper
// (community-representative.mapper.ts). tasks.md 9.5.
export class CommunityTechnicianMapper {
  static toDomain(record: PrismaCommunityTechnician): CommunityTechnician {
    return new CommunityTechnician({
      id: record.id,
      communityId: record.communityId,
      userId: record.userId,
      deactivatedAt: record.deactivatedAt,
    });
  }

  static toPersistence(
    technician: CommunityTechnician,
  ): Prisma.CommunityTechnicianCreateInput {
    return {
      id: technician.id,
      communityId: technician.communityId,
      userId: technician.userId,
      deactivatedAt: technician.deactivatedAt,
    };
  }
}
