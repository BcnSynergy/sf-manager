import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_SCOPE_CHECKER,
  type CommunityScopeChecker,
} from '../../../../shared/application/authorization/community-scope.checker.port';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
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

  // tasks.md 4.1: the by-id counterpart. Same Layer 2 scope resolution and
  // exhaustive role dispatch as listForActor, but to the two by-id
  // repository methods. `null` — unknown id, draft, foreign performer,
  // foreign community, or a since-deactivated assignment (empty
  // communityIds) — ALL collapse to the SAME ReviewSessionNotFoundError, one
  // throw site, mirroring SessionAccessService.loadForActor's own rejection
  // matrix (design.md Decision 1 / Data Flow).
  async loadCompletedForActor(
    sessionId: string,
    actor: Actor,
  ): Promise<ReviewSession> {
    const communityIds =
      await this.communityScopeChecker.listAssignedCommunityIds(
        actor.userId,
        actor.role,
      );
    if (communityIds.length === 0) {
      throw new ReviewSessionNotFoundError();
    }

    const session = await this.loadByRole(sessionId, actor, communityIds);
    if (!session) {
      throw new ReviewSessionNotFoundError();
    }

    return session;
  }

  private loadByRole(
    sessionId: string,
    actor: Actor,
    communityIds: readonly string[],
  ): Promise<ReviewSession | null> {
    switch (actor.role) {
      case 'MAINTENANCE_TECHNICIAN':
        return this.repository.findCompletedByIdForPerformerInCommunities(
          sessionId,
          actor.userId,
          communityIds,
        );
      case 'COMMUNITY_REPRESENTATIVE':
        return this.repository.findCompletedByIdInCommunities(
          sessionId,
          communityIds,
        );
      // Same fail-closed backstop as listForActor: no history scope for
      // these roles at all, so they never reach a repository call.
      case 'SYSTEM_ADMIN':
      case 'MANAGER':
      case 'MAINTENANCE_COMPANY_MANAGER':
        return Promise.resolve(null);
      default: {
        actor.role satisfies never;
        return Promise.resolve(null);
      }
    }
  }
}
