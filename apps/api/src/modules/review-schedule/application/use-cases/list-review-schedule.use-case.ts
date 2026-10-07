import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_SCOPE_CHECKER,
  type CommunityScopeChecker,
} from '../../../../shared/application/authorization/community-scope.checker.port';
import {
  MANAGER_CAPABILITY_CHECKER,
  type ManagerCapabilityChecker,
} from '../../../../shared/application/authorization/manager-capability.checker.port';
import {
  CLOCK,
  type Clock,
} from '../../../../shared/application/ports/clock.port';
import type { ElementType } from '../../../inspectable-element/domain/element-type';
import type { Role } from '../../../users/domain/role';
import {
  coverageWindowStart,
  madridDate,
  type Quarter,
} from '../../domain/calendar-quarter';
import {
  compareScheduleRows,
  evaluateReviewDue,
  type PairCoverage,
  type ScheduleReasonCode,
  type ScheduleStatus,
} from '../../domain/review-due.policy';
import {
  REVIEW_SCHEDULE_READER,
  type ReviewScheduleReader,
  type ScheduleScope,
} from '../ports/review-schedule.reader.port';

// The caller, as the controller extracts it from the session. Declared here so
// this module does not reach into review-session's application layer for a
// two-field shape.
export interface ScheduleActor {
  userId: string;
  role: Role;
}

// DTO-agnostic row model: the use case's output. The controller flattens it
// into the response DTO (PR 6); dates are `YYYY-MM-DD` Europe/Madrid
// calendar strings, never `Date` or ISO instants.
export interface ReviewScheduleRow {
  communityId: string;
  communityName: string;
  elementType: ElementType;
  status: ScheduleStatus;
  reasonCode: ScheduleReasonCode;
  quarter: Quarter | null;
  deadline: string | null;
  // Null only for NEVER_REVIEWED (there is no covering session).
  lastCoveringSessionDate: string | null;
}

// design.md Decisions 4, 7 and 8, Data Flow: resolve the scope for the
// caller's role, read `now` once, read the pairs, evaluate each with the pure
// due policy and sort. No writes, no stored projection.
//
// Scope resolution is an exhaustive `switch` on the role. Every empty scope
// returns BEFORE any reader call, so a caller with no scope reaches no
// schedule data. The capability and assignment checkers re-read on every
// call, so a revocation applies on the next request. An infrastructure fault
// in a checker is not caught: it surfaces as an error, never as `[]`.
@Injectable()
export class ListReviewScheduleUseCase {
  constructor(
    @Inject(REVIEW_SCHEDULE_READER)
    private readonly reader: ReviewScheduleReader,
    @Inject(COMMUNITY_SCOPE_CHECKER)
    private readonly communityScopeChecker: CommunityScopeChecker,
    @Inject(MANAGER_CAPABILITY_CHECKER)
    private readonly managerCapabilityChecker: ManagerCapabilityChecker,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: ScheduleActor): Promise<ReviewScheduleRow[]> {
    const scope = await this.resolveScope(actor);
    if (scope === null) {
      return [];
    }

    const now = this.clock.now();
    const pairs = await this.reader.listPairs(scope, coverageWindowStart(now));

    return pairs
      .map((pair): ReviewScheduleRow => {
        const evaluation = evaluateReviewDue(pair.coverage, now);
        return {
          communityId: pair.communityId,
          communityName: pair.communityName,
          elementType: pair.elementType,
          status: evaluation.status,
          reasonCode: evaluation.reasonCode,
          quarter: evaluation.quarter,
          deadline: evaluation.deadline,
          lastCoveringSessionDate: lastCoveringSessionDate(pair.coverage),
        };
      })
      .sort(compareScheduleRows);
  }

  // `null` means "no scope": the caller reaches no data at all.
  private async resolveScope(
    actor: ScheduleActor,
  ): Promise<ScheduleScope | null> {
    switch (actor.role) {
      case 'SYSTEM_ADMIN':
        return { kind: 'all' };

      case 'MANAGER': {
        const granted =
          await this.managerCapabilityChecker.hasManagerCapability(
            actor.userId,
            actor.role,
            'VIEW_ALL_REVIEWS',
          );
        return granted ? { kind: 'all' } : null;
      }

      // Assignment-based for both roles, with no performer-based widening:
      // a technician's own past sessions confer no scope.
      case 'COMMUNITY_REPRESENTATIVE':
      case 'MAINTENANCE_TECHNICIAN': {
        const communityIds =
          await this.communityScopeChecker.listAssignedCommunityIds(
            actor.userId,
            actor.role,
          );
        return communityIds.length === 0
          ? null
          : { kind: 'communities', communityIds };
      }

      // The permission guard already returns 403; this is the backstop.
      case 'MAINTENANCE_COMPANY_MANAGER':
        return null;

      default: {
        // `role` is read from the database with no runtime enum validation.
        actor.role satisfies never;
        return null;
      }
    }
  }
}

// The Madrid calendar date of the latest covering session, or null when the
// pair has none. `lastBeforeSinceAt` is older than every `recentCoveringAt`
// entry by construction, but the maximum is taken over all of them so the
// result does not depend on that.
function lastCoveringSessionDate(coverage: PairCoverage): string | null {
  const instants = [
    ...(coverage.lastBeforeSinceAt ? [coverage.lastBeforeSinceAt] : []),
    ...coverage.recentCoveringAt,
  ].map((instant) => instant.getTime());
  if (instants.length === 0) {
    return null;
  }
  return madridDate(new Date(Math.max(...instants)));
}
