import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';

export interface ReviewHistoryRow {
  id: string;
  communityId: string;
  communityName: string;
  performedById: string;
  startedAt: Date;
  completedAt: Date;
}

// review-history design.md Decision 6 / File Changes: scope -> rows +
// community-name map. `communityName` is resolved by calling the existing
// CommunityRepository.findById ONCE PER DISTINCT community appearing in
// the actor's scoped result — not per row (same accepted cardinality
// GetReviewScopeUseCase already runs, design.md Decision 6). Order is
// preserved exactly as returned by ReviewHistoryAccessService (already
// `completedAt DESC, id DESC` from the repository, design.md Decision 3).
@Injectable()
export class ListReviewHistoryUseCase {
  constructor(
    private readonly reviewHistoryAccessService: ReviewHistoryAccessService,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
  ) {}

  async execute(actor: Actor): Promise<ReviewHistoryRow[]> {
    const sessions = await this.reviewHistoryAccessService.listForActor(actor);

    const communityIds = [...new Set(sessions.map((s) => s.communityId))];
    const communityNameById = new Map<string, string>();
    for (const communityId of communityIds) {
      const community = await this.communityRepository.findById(communityId);
      if (community) {
        communityNameById.set(communityId, community.name);
      }
    }

    return sessions.map((session) => ({
      id: session.id,
      communityId: session.communityId,
      communityName: communityNameById.get(session.communityId) ?? '',
      performedById: session.performedById,
      // Completed sessions always carry a non-null completedAt — the
      // ReviewSession domain type keeps it nullable because a draft has
      // none, but every row here came from a `findCompleted…` query.
      startedAt: session.startedAt,
      completedAt: session.completedAt as Date,
    }));
  }
}
