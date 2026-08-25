import { Inject, Injectable } from '@nestjs/common';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../ports/community.repository.port';
import {
  COMMUNITY_REPRESENTATIVE_REPOSITORY,
  type CommunityRepresentativeRepository,
} from '../ports/community-representative.repository.port';

// design.md File Changes + community-management spec.md "Soft-Delete
// Community": sets deletedAt (ADR-010, no row deletion) — same default
// deletedAt: null filter as findAll, so a missing or already soft-deleted id
// both 404 identically.
//
// design.md "Data Flow — Community Soft-Delete Cascade to Representative"
// (Phase 7 / PR 7): after the community is soft-deleted, conditionally
// deactivate its sole-active representative. `countActiveByUser` is reused
// as-is from the multi-community warning (design.md rationale) — no new
// port method, no new domain error. Technician repositories are never
// injected here and never called (community-management spec.md: "MUST NOT
// perform any operation on that community's technician assignments").
@Injectable()
export class SoftDeleteCommunityUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    private readonly representativeRepository: CommunityRepresentativeRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.communityRepository.findById(id);
    if (!existing) {
      throw new CommunityNotFoundError();
    }

    await this.communityRepository.softDeleteById(id);

    const incumbent =
      await this.representativeRepository.findActiveByCommunity(id);
    if (!incumbent) {
      return;
    }

    const communityCount =
      await this.representativeRepository.countActiveByUser(incumbent.userId);
    if (communityCount > 1) {
      // Active in at least one other community — left unchanged (design.md:
      // "no-op, assignment left active").
      return;
    }

    await this.representativeRepository.setDeactivatedAt(
      id,
      incumbent.userId,
      new Date(),
    );
  }
}
