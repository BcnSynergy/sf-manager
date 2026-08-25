import { Inject, Injectable } from '@nestjs/common';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../ports/community.repository.port';

// design.md File Changes + community-management spec.md "Soft-Delete
// Community": sets deletedAt (ADR-010, no row deletion) — same default
// deletedAt: null filter as findAll, so a missing or already soft-deleted id
// both 404 identically.
//
// IMPORTANT — scope of this PR (PR 4, Phase 4): this use case deliberately
// does NOT implement the representative-deactivation cascade described in
// community-management spec.md ("Soft-deleting a community deactivates its
// sole-active representative") and detailed in design.md's "Data Flow —
// Community Soft-Delete Cascade to Representative". That cascade needs
// CommunityRepresentativeRepository.findActiveByCommunity/countActiveByUser/
// setDeactivatedAt, which are introduced in Phase 6 (PR 6). Phase 7 (PR 7,
// tasks.md 7.1/7.2) extends THIS use case with that cascade once the
// representative port exists. Until PR 7 lands, soft-deleting a community
// has no effect on any representative or technician assignment.
@Injectable()
export class SoftDeleteCommunityUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.communityRepository.findById(id);
    if (!existing) {
      throw new CommunityNotFoundError();
    }

    await this.communityRepository.softDeleteById(id);
  }
}
