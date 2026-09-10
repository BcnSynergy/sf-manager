import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import {
  USER_DIRECTORY,
  type UserDirectory,
} from '../ports/user-directory.port';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';

export interface ReviewHistoryRow {
  id: string;
  communityId: string;
  communityName: string;
  performedById: string;
  performedByEmail: string;
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
//
// review-history-company-scope/design.md Decision 8: `performedByEmail` is
// resolved by ONE `UserDirectory.findEmailsByIds` call over the distinct
// `performedById` values in the result — a company-wide list can span many
// technicians, unlike the per-community loop above, so this is a single
// batched call, not N. Unresolvable ⇒ `''`.
@Injectable()
export class ListReviewHistoryUseCase {
  constructor(
    private readonly reviewHistoryAccessService: ReviewHistoryAccessService,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(USER_DIRECTORY)
    private readonly userDirectory: UserDirectory,
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

    const performerIds = [...new Set(sessions.map((s) => s.performedById))];
    const emailByPerformerId =
      await this.userDirectory.findEmailsByIds(performerIds);

    return sessions.map((session) => ({
      id: session.id,
      communityId: session.communityId,
      communityName: communityNameById.get(session.communityId) ?? '',
      performedById: session.performedById,
      performedByEmail: emailByPerformerId.get(session.performedById) ?? '',
      // Completed sessions always carry a non-null completedAt — the
      // ReviewSession domain type keeps it nullable because a draft has
      // none, but every row here came from a `findCompleted…` query.
      startedAt: session.startedAt,
      completedAt: session.completedAt as Date,
    }));
  }
}
