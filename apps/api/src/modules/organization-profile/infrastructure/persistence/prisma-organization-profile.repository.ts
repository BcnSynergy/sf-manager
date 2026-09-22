import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  OrganizationProfileChanges,
  OrganizationProfileRepository,
} from '../../application/ports/organization-profile.repository.port';
import { OrganizationProfileMissingError } from '../../domain/errors/organization-profile-missing.error';
import { OrganizationProfile } from '../../domain/organization-profile.entity';
import { OrganizationProfileMapper } from './organization-profile.mapper';

// Prisma adapter for the OrganizationProfileRepository port (ADR-013).
// Deliberately NOT `extends SoftDeletableRepository` — this entity has no
// `deletedAt` (design.md, spec.md "The Profile Has No Create and No Delete
// Surface").
//
// Both operations are addressed by `{ singleton: true }` — the Prisma-visible
// half of the sentinel guard (design.md Decision 1) — never by a literal id
// and never via `findFirst()`. This is the structural guard the design
// rejected `findFirst()`/a hardcoded-id `findUnique()` in favour of: the
// unique index on `singleton` makes `{ singleton: true }` a legal, typed
// `where` with no magic constant in application code.
@Injectable()
export class PrismaOrganizationProfileRepository
  implements OrganizationProfileRepository
{
  constructor(private readonly prisma: PrismaService) {}

  // design.md Decision 1: `get()` never resolves `| null`. A missing row is
  // an environment defect (a skipped migration), not a runtime condition —
  // this is the ONLY place that can observe it, and it throws rather than
  // returning null or 404ing.
  async get(): Promise<OrganizationProfile> {
    const record = await this.prisma.organizationProfile.findUnique({
      where: { singleton: true },
    });

    if (!record) {
      throw new OrganizationProfileMissingError();
    }

    return OrganizationProfileMapper.toDomain(record);
  }

  // design.md Decision 3: one atomic UPDATE, no preliminary read. Prisma's
  // update() returns the post-state row, which is the authoritative result
  // returned to the caller.
  async update(
    changes: OrganizationProfileChanges,
  ): Promise<OrganizationProfile> {
    const record = await this.prisma.organizationProfile.update({
      where: { singleton: true },
      data: changes,
    });

    return OrganizationProfileMapper.toDomain(record);
  }
}
