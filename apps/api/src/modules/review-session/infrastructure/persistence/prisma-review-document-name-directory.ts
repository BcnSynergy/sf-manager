import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  ReviewDocumentElementIdentity,
  ReviewDocumentNameDirectory,
} from '../../application/ports/review-document-name-directory.port';

// Prisma adapter for the ReviewDocumentNameDirectory port (design.md
// Decision 4), owned entirely by `review-session` — reads `PrismaService`
// directly, mirroring `PrismaUserDirectory`. Not yet bound in
// review-session.module.ts (that is PR 7's job, per tasks.md 4.2).
//
// Deliberately soft-delete- and deactivation-inclusive on every method —
// see review-document-name-directory.port.ts for the full rationale. This
// adapter never applies ADR-010's default soft-delete filter
// (CommunityRepository/MaintenanceCompanyRepository.findById) nor
// `findActiveByCommunityAndType`'s deactivation filter.
@Injectable()
export class PrismaReviewDocumentNameDirectory implements ReviewDocumentNameDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async findCommunityName(communityId: string): Promise<string | null> {
    const record = await this.prisma.community.findUnique({
      where: { id: communityId },
      select: { name: true },
    });

    return record?.name ?? null;
  }

  async findMaintenanceCompanyName(companyId: string): Promise<string | null> {
    const record = await this.prisma.maintenanceCompany.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    return record?.name ?? null;
  }

  // ONE batched query for the whole distinct id set (design.md Data Flow
  // step 3), not N. An id with no matching row is simply absent from the
  // returned map.
  async findElementsByIds(
    ids: readonly string[],
  ): Promise<Map<string, ReviewDocumentElementIdentity>> {
    if (ids.length === 0) {
      return new Map();
    }

    const records = await this.prisma.inspectableElement.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, code: true, name: true, location: true },
    });

    return new Map(
      records.map((record) => [
        record.id,
        { code: record.code, name: record.name, location: record.location },
      ]),
    );
  }
}
