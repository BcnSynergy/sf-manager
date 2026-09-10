import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_SCOPE_CHECKER,
  type CommunityScopeChecker,
} from '../../../../shared/application/authorization/community-scope.checker.port';
import {
  COMPANY_SCOPE_CHECKER,
  type CompanyScopeChecker,
} from '../../../../shared/application/authorization/company-scope.checker.port';
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
// record" (completed-only, scope-widened for a representative or a
// company-wide manager). Different invariants, different status filter,
// different scope predicate — SessionAccessService is left byte-unchanged.
//
// review-history-company-scope/design.md Decision 7 (the 2026-09-09
// reversal): scope resolution no longer happens once, before the `switch`.
// Each role branch resolves ONLY the scope it needs, and only inside its
// own branch — a MAINTENANCE_TECHNICIAN makes no Layer 2 call at all
// ("mine" is performer identity, Layer 3, never community membership); a
// MAINTENANCE_COMPANY_MANAGER resolves through CompanyScopeChecker and
// fails closed to `[]`/404 BEFORE any repository call on a `null` company.
//
// The invariant both services rely on is preserved by the PORT, not by the
// service count: ReviewSessionRepository still exposes no identifier-only
// read — every `findCompleted…` method carries a performer, community or
// company scope as a required parameter.
@Injectable()
export class ReviewHistoryAccessService {
  constructor(
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly repository: ReviewSessionRepository,
    @Inject(COMMUNITY_SCOPE_CHECKER)
    private readonly communityScopeChecker: CommunityScopeChecker,
    @Inject(COMPANY_SCOPE_CHECKER)
    private readonly companyScopeChecker: CompanyScopeChecker,
  ) {}

  async listForActor(actor: Actor): Promise<ReviewSession[]> {
    switch (actor.role) {
      // REVERSED 2026-09-09 (design.md Decision 7): own performed sessions,
      // unconditionally. No Layer 2 call at all — there is no
      // `communityIds` parameter left to forget, and the performer filter
      // is still the only conjunct in the `WHERE`, so this widens the
      // technician's view by exactly zero other people's sessions. A
      // deactivated assignment can no longer swallow this branch, because
      // it never runs the community check that used to gate it.
      case 'MAINTENANCE_TECHNICIAN':
        return this.repository.findCompletedForPerformer(actor.userId);

      // UNCHANGED, byte for byte in behaviour — still gated on a currently
      // active assignment, still re-read per request, still an
      // empty-scope early return before any repository call.
      case 'COMMUNITY_REPRESENTATIVE': {
        const communityIds =
          await this.communityScopeChecker.listAssignedCommunityIds(
            actor.userId,
            actor.role,
          );
        if (communityIds.length === 0) {
          return [];
        }
        return this.repository.findCompletedInCommunities(communityIds);
      }

      // NEW (design.md Decision 3/4/7/9): the manager's scope is their own
      // maintenance company, re-read per request, ANDed with nothing else.
      // `null` — no company, or a soft-deleted manager — fails closed
      // BEFORE any repository call.
      case 'MAINTENANCE_COMPANY_MANAGER': {
        const companyId = await this.companyScopeChecker.resolveCompanyScope(
          actor.userId,
          actor.role,
        );
        if (companyId === null) {
          return [];
        }
        return this.repository.findCompletedForCompany(companyId);
      }

      // No history scope for these roles at all (proposal Settled scope
      // decisions) — they never reach a repository call.
      case 'SYSTEM_ADMIN':
      case 'MANAGER':
        return [];
      default: {
        // `role` comes from a JWT claim with no runtime enum validation —
        // same fail-closed backstop as CommunityScopeChecker's own switch.
        actor.role satisfies never;
        return [];
      }
    }
  }

  // The by-id counterpart. Same per-branch scope resolution and exhaustive
  // role dispatch as listForActor, but to the by-id repository methods.
  // `null` — unknown id, draft, foreign performer, foreign community,
  // foreign company, a since-deactivated assignment, or a null company
  // scope — ALL collapse to the SAME ReviewSessionNotFoundError, ONE throw
  // site, mirroring SessionAccessService.loadForActor's own rejection
  // matrix (design.md Decision 7 table).
  async loadCompletedForActor(
    sessionId: string,
    actor: Actor,
  ): Promise<ReviewSession> {
    const session = await this.loadByRole(sessionId, actor);
    if (!session) {
      throw new ReviewSessionNotFoundError();
    }

    return session;
  }

  private async loadByRole(
    sessionId: string,
    actor: Actor,
  ): Promise<ReviewSession | null> {
    switch (actor.role) {
      case 'MAINTENANCE_TECHNICIAN':
        return this.repository.findCompletedByIdForPerformer(
          sessionId,
          actor.userId,
        );

      case 'COMMUNITY_REPRESENTATIVE': {
        const communityIds =
          await this.communityScopeChecker.listAssignedCommunityIds(
            actor.userId,
            actor.role,
          );
        if (communityIds.length === 0) {
          return null;
        }
        return this.repository.findCompletedByIdInCommunities(
          sessionId,
          communityIds,
        );
      }

      case 'MAINTENANCE_COMPANY_MANAGER': {
        const companyId = await this.companyScopeChecker.resolveCompanyScope(
          actor.userId,
          actor.role,
        );
        if (companyId === null) {
          return null;
        }
        return this.repository.findCompletedByIdForCompany(
          sessionId,
          companyId,
        );
      }

      // Same fail-closed backstop as listForActor: no history scope for
      // these roles at all, so they never reach a repository call.
      case 'SYSTEM_ADMIN':
      case 'MANAGER':
        return null;
      default: {
        actor.role satisfies never;
        return null;
      }
    }
  }
}
