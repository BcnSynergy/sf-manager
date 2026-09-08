import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_SCOPE_CHECKER,
  type CommunityScopeChecker,
} from '../../../../shared/application/authorization/community-scope.checker.port';
import { ReviewSession } from '../../domain/review-session.entity';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';
import type { Actor } from './session-access.service';

// design.md Decision 1: a read-only SIBLING of SessionAccessService, not an
// extension of it. SessionAccess = "may this actor ACT on this draft"
// (performer-only, any status); this = "may this actor READ this completed
// record" (completed-only, scope-widened for a representative). Different
// invariants, different status filter, different scope predicate —
// SessionAccessService is left byte-unchanged (Decision 1's whole point).
//
// The invariant both rely on is preserved by the PORT, not by the service
// count: ReviewSessionRepository still exposes no identifier-only read —
// all four `findCompleted…` methods carry a performer and/or community
// scope as a required parameter.
@Injectable()
export class ReviewHistoryAccessService {
  constructor(
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly repository: ReviewSessionRepository,
    @Inject(COMMUNITY_SCOPE_CHECKER)
    private readonly communityScopeChecker: CommunityScopeChecker,
  ) {}

  // Empty scope => empty list, never an error and never an unscoped query
  // (design.md Decision 3's "empty-scope footgun, made explicit").
  async listForActor(actor: Actor): Promise<ReviewSession[]> {
    const communityIds =
      await this.communityScopeChecker.listAssignedCommunityIds(
        actor.userId,
        actor.role,
      );
    if (communityIds.length === 0) {
      return [];
    }

    switch (actor.role) {
      case 'MAINTENANCE_TECHNICIAN':
        return this.repository.findCompletedForPerformerInCommunities(
          actor.userId,
          communityIds,
        );
      case 'COMMUNITY_REPRESENTATIVE':
        return this.repository.findCompletedInCommunities(communityIds);
      // No history scope for these roles at all (proposal Settled scope
      // decisions) — they never reach a repository call, even though
      // listAssignedCommunityIds already returns `[]` for them too.
      case 'SYSTEM_ADMIN':
      case 'MANAGER':
      case 'MAINTENANCE_COMPANY_MANAGER':
        return [];
      default: {
        // `role` comes from a JWT claim with no runtime enum validation —
        // same fail-closed backstop as CommunityScopeChecker's own switch.
        actor.role satisfies never;
        return [];
      }
    }
  }
}
