import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_SCOPE_CHECKER,
  type CommunityScopeChecker,
} from '../../../../shared/application/authorization/community-scope.checker.port';
import {
  COMPANY_SCOPE_CHECKER,
  type CompanyScopeChecker,
} from '../../../../shared/application/authorization/company-scope.checker.port';
import {
  MANAGER_CAPABILITY_CHECKER,
  type ManagerCapabilityChecker,
} from '../../../../shared/application/authorization/manager-capability.checker.port';
import type { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import {
  REVIEW_SESSION_REPOSITORY,
  type ElementReviewEntryRow,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';
import type { Actor } from './session-access.service';

// review-history-per-element/design.md Decision 4: the reachability
// verdict for the element-keyed read. A DISCRIMINATED UNION, deliberately
// NOT `ElementReviewEntryRow[] | null` — this is the one surface where an
// empty array and "not reachable" are different answers, and `{ reachable:
// false }` has no `entries` property to read at all.
export type ElementHistoryScope =
  { reachable: false } | { reachable: true; entries: ElementReviewEntryRow[] };

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
    @Inject(MANAGER_CAPABILITY_CHECKER)
    private readonly managerCapabilityChecker: ManagerCapabilityChecker,
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

      // NEW (review-history-admin-scope design.md Decision 1/3): the ONLY
      // branch in this service with no scope resolution at all. There is
      // no AdminScopeChecker to call — a checker that always answers
      // "everything" would be ceremony that dilutes the meaning of the two
      // real checkers. The ROLE *is* the scope (proposal "No scope
      // predicate at all"), so there is nothing to fail closed ON, and no
      // early return belongs here.
      case 'SYSTEM_ADMIN':
        return this.repository.findCompletedAcrossInstallation();

      // NEW (review-history-manager-capability/design.md Decision 2/3): the
      // role is no longer inert, but the ROLE alone still grants nothing —
      // the capability is the scope predicate (ADR-011 Decision 2, first
      // implementation). Fail closed BEFORE any repository call: an
      // ungranted MANAGER reaches no query at all, observably identical to
      // the `[]` this branch returned before this slice. A granted MANAGER
      // gets the SYSTEM_ADMIN read VERBATIM — the SAME method, second call
      // site (no new repository method).
      case 'MANAGER': {
        const granted =
          await this.managerCapabilityChecker.hasManagerCapability(
            actor.userId,
            actor.role,
            'VIEW_ALL_REVIEWS',
          );
        if (!granted) {
          return [];
        }
        return this.repository.findCompletedAcrossInstallation();
      }
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

      // NEW (review-history-admin-scope design.md Decision 1/3): identical
      // split to listForActor — no scope resolution, straight to the
      // unscoped by-id read.
      case 'SYSTEM_ADMIN':
        return this.repository.findCompletedByIdAcrossInstallation(sessionId);

      // NEW (review-history-manager-capability/design.md Decision 2/3):
      // identical split to listForActor — fail closed before any
      // repository call; a granted MANAGER reuses the by-id
      // …AcrossInstallation read verbatim.
      case 'MANAGER': {
        const granted =
          await this.managerCapabilityChecker.hasManagerCapability(
            actor.userId,
            actor.role,
            'VIEW_ALL_REVIEWS',
          );
        if (!granted) {
          return null;
        }
        return this.repository.findCompletedByIdAcrossInstallation(sessionId);
      }
      default: {
        actor.role satisfies never;
        return null;
      }
    }
  }

  // review-history-per-element/design.md Decision 4: the element-keyed
  // counterpart — a read-only SIBLING dispatcher beside listForActor/
  // loadByRole, same checkers, same fail-closed-before-any-repository-call
  // discipline. UNLIKE those two, "no entries" means TWO different things
  // depending on role: for TECHNICIAN and COMPANY_MANAGER the scope is
  // session-derived, so zero entries IS unreachable (404, spec.md "Element
  // Reachability Decides 404 Versus an Empty History"); for
  // REPRESENTATIVE/SYSTEM_ADMIN/granted MANAGER the scope is relational to
  // the element's own context (an assignment, or the whole installation),
  // so zero entries is a true, disclosable empty state.
  async listElementHistoryForActor(
    element: InspectableElement,
    actor: Actor,
  ): Promise<ElementHistoryScope> {
    switch (actor.role) {
      case 'MAINTENANCE_TECHNICIAN': {
        const entries =
          await this.repository.findCompletedEntriesForElementForPerformer(
            element.id,
            actor.userId,
          );
        return entries.length === 0
          ? { reachable: false }
          : { reachable: true, entries };
      }

      case 'COMMUNITY_REPRESENTATIVE': {
        const communityIds =
          await this.communityScopeChecker.listAssignedCommunityIds(
            actor.userId,
            actor.role,
          );
        // The REACHABILITY gate consults the ASSIGNMENT, never the entry
        // set — a never-reviewed element in an assigned community renders
        // an empty state, not a 404 (design.md Decision 4, OQ5).
        if (!communityIds.includes(element.communityId)) {
          return { reachable: false };
        }
        return {
          reachable: true,
          entries:
            await this.repository.findCompletedEntriesForElementInCommunities(
              element.id,
              communityIds,
            ),
        };
      }

      case 'MAINTENANCE_COMPANY_MANAGER': {
        const companyId = await this.companyScopeChecker.resolveCompanyScope(
          actor.userId,
          actor.role,
        );
        if (companyId === null) {
          return { reachable: false };
        }
        const entries =
          await this.repository.findCompletedEntriesForElementForCompany(
            element.id,
            companyId,
          );
        return entries.length === 0
          ? { reachable: false }
          : { reachable: true, entries };
      }

      case 'SYSTEM_ADMIN':
        return {
          reachable: true,
          entries:
            await this.repository.findCompletedEntriesForElementAcrossInstallation(
              element.id,
            ),
        };

      case 'MANAGER': {
        const granted =
          await this.managerCapabilityChecker.hasManagerCapability(
            actor.userId,
            actor.role,
            'VIEW_ALL_REVIEWS',
          );
        if (!granted) {
          return { reachable: false };
        }
        return {
          reachable: true,
          entries:
            await this.repository.findCompletedEntriesForElementAcrossInstallation(
              element.id,
            ),
        };
      }
      default: {
        actor.role satisfies never;
        return { reachable: false };
      }
    }
  }
}
