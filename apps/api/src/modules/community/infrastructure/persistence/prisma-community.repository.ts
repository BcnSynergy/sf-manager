import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import { CommunityRepository } from '../../application/ports/community.repository.port';
import { Community, Locale } from '../../domain/community.entity';
import { CommunityMapper } from './community.mapper';

// Prisma adapter for the CommunityRepository port (ADR-013). Extends
// SoftDeletableRepository so the ADR-010 `deletedAt: null` default filter is
// enforced by construction, not reimplemented here — mirrors
// PrismaUserRepository. Unlike PrismaUserRepository, this adapter has no
// transactional() — that concurrency seam belongs to
// PrismaCommunityRepresentativeRepository (PR 6), not plain Community CRUD
// (design.md Decision 1/2).
@Injectable()
export class PrismaCommunityRepository
  extends SoftDeletableRepository
  implements CommunityRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Plain insert (design.md Decision 8 precedent) — no uniqueness
  // constraint on name/address in this slice.
  async create(community: Community): Promise<void> {
    await this.prisma.community.create({
      data: CommunityMapper.toPersistence(community),
    });
  }

  // Default `deletedAt: null` filter (ADR-010) — a soft-deleted community
  // resolves to null, so Update/SoftDelete use cases 404 it the same way as
  // "no such community".
  async findById(id: string): Promise<Community | null> {
    const record = await this.prisma.community.findFirst({
      where: this.withDefaultFilter({ id }),
    });

    return record ? CommunityMapper.toDomain(record) : null;
  }

  // Soft-deleted communities are EXCLUDED by default (ADR-010,
  // community-management spec.md "Soft-deleted communities excluded from
  // the list").
  async findAll(): Promise<Community[]> {
    const records = await this.prisma.community.findMany({
      where: this.withDefaultFilter({}),
    });

    return records.map((record) => CommunityMapper.toDomain(record));
  }

  async updateById(
    id: string,
    changes: { name?: string; address?: string; locale?: Locale },
  ): Promise<void> {
    await this.prisma.community.update({
      where: { id },
      data: changes,
    });
  }

  // Sets deletedAt (ADR-010) — no row deletion. The representative
  // deactivation cascade lives in SoftDeleteCommunityUseCase (Phase 7),
  // never in this adapter.
  async softDeleteById(id: string): Promise<void> {
    await this.prisma.community.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
