import {
  addTwelveMonths,
  madridDate,
  previousQuarter,
  quarterEnd,
  quarterOf,
  type Quarter,
} from './calendar-quarter';

// Pure due policy for one (community, elementType) pair (design.md, Due
// Policy). It maps coverage facts and `now` to one combined status. No I/O,
// no framework. Every date is a Europe/Madrid calendar date (`YYYY-MM-DD`).

// Coverage facts for one pair, folded by the reader from completed sessions
// whose frozen template frequency is QUARTERLY or ANNUAL. Declared here (not in
// the reader port) so the domain never imports from `application/`.
// Invariant the reader must uphold: an ANNUAL session counted in
// `lastAnnualAt` is also a covering session, so it also appears in
// `lastBeforeSinceAt` or `recentCoveringAt`. A non-null `lastAnnualAt` with no
// covering session is not a valid input (the policy reports NEVER_REVIEWED).
export interface PairCoverage {
  // Latest covering `completedAt` before the coverage window; non-null means a
  // covering session older than the window exists.
  lastBeforeSinceAt: Date | null;
  // Latest ANNUAL covering `completedAt`, over all time.
  lastAnnualAt: Date | null;
  // Every covering `completedAt` inside the window. The window is a safe
  // superset of the previous quarter, so dates are narrowed here.
  recentCoveringAt: readonly Date[];
}

// Single source of truth for the status and reason-code vocabularies: the
// types below derive from these, and the presentation layer reuses them for
// its OpenAPI enums so a new member cannot leave the documentation stale.
export const SCHEDULE_STATUSES = [
  'OVERDUE',
  'NEVER_REVIEWED',
  'UPCOMING',
  'UP_TO_DATE',
] as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const SCHEDULE_REASON_CODES = [
  'NEVER_REVIEWED',
  'QUARTER_MISSED',
  'QUARTER_DUE',
  'ANNUAL_OVERDUE',
  'ANNUAL_DUE',
  'ANNUAL_NOT_ON_RECORD',
  'UP_TO_DATE',
] as const;

export type ScheduleReasonCode = (typeof SCHEDULE_REASON_CODES)[number];

export interface ReviewDueEvaluation {
  status: ScheduleStatus;
  reasonCode: ScheduleReasonCode;
  quarter: Quarter | null; // QUARTER_* reason codes only
  deadline: string | null; // YYYY-MM-DD, Madrid calendar date
}

const NEVER_REVIEWED: ReviewDueEvaluation = {
  status: 'NEVER_REVIEWED',
  reasonCode: 'NEVER_REVIEWED',
  quarter: null,
  deadline: null,
};

const SATISFIED: ReviewDueEvaluation = {
  status: 'UP_TO_DATE',
  reasonCode: 'UP_TO_DATE',
  quarter: null,
  deadline: null,
};

const sameQuarter = (a: Quarter, b: Quarter): boolean =>
  a.year === b.year && a.number === b.number;

const isBefore = (a: Quarter, b: Quarter): boolean =>
  a.year < b.year || (a.year === b.year && a.number < b.number);

function evaluateQuarterly(
  coverage: PairCoverage,
  current: Quarter,
): ReviewDueEvaluation {
  const previous = previousQuarter(current);
  const recentQuarters = coverage.recentCoveringAt.map((at) =>
    quarterOf(madridDate(at)),
  );

  if (recentQuarters.some((quarter) => sameQuarter(quarter, current))) {
    // A missed previous quarter is no longer reported once the current one
    // is covered: the list shows actionable work only.
    return SATISFIED;
  }

  const previousCovered = recentQuarters.some((quarter) =>
    sameQuarter(quarter, previous),
  );
  const hasEarlierSession =
    coverage.lastBeforeSinceAt !== null ||
    recentQuarters.some((quarter) => isBefore(quarter, previous));

  if (!previousCovered && hasEarlierSession) {
    return {
      status: 'OVERDUE',
      reasonCode: 'QUARTER_MISSED',
      quarter: previous,
      deadline: quarterEnd(previous),
    };
  }
  return {
    status: 'UPCOMING',
    reasonCode: 'QUARTER_DUE',
    quarter: current,
    deadline: quarterEnd(current),
  };
}

function evaluateAnnual(
  coverage: PairCoverage,
  today: string,
  current: Quarter,
): ReviewDueEvaluation {
  const currentQuarterEnd = quarterEnd(current);
  if (coverage.lastAnnualAt === null) {
    return {
      status: 'UPCOMING',
      reasonCode: 'ANNUAL_NOT_ON_RECORD',
      quarter: null,
      deadline: currentQuarterEnd,
    };
  }
  // Inclusive: a review dated exactly on the anniversary is on time.
  const deadline = addTwelveMonths(madridDate(coverage.lastAnnualAt));
  if (today > deadline) {
    return {
      status: 'OVERDUE',
      reasonCode: 'ANNUAL_OVERDUE',
      quarter: null,
      deadline,
    };
  }
  if (deadline <= currentQuarterEnd) {
    return {
      status: 'UPCOMING',
      reasonCode: 'ANNUAL_DUE',
      quarter: null,
      deadline,
    };
  }
  return SATISFIED;
}

const SEVERITY: Record<ScheduleStatus, number> = {
  OVERDUE: 3,
  NEVER_REVIEWED: 2, // not produced by the obligation evaluators
  UPCOMING: 1,
  UP_TO_DATE: 0,
};

// The worse status wins; with equal status the earlier deadline drives, and
// on equal deadlines the quarterly obligation drives.
function worseOf(
  quarterly: ReviewDueEvaluation,
  annual: ReviewDueEvaluation,
): ReviewDueEvaluation {
  const bySeverity = SEVERITY[quarterly.status] - SEVERITY[annual.status];
  if (bySeverity !== 0) return bySeverity > 0 ? quarterly : annual;
  if (quarterly.deadline === null || annual.deadline === null) {
    return quarterly; // both satisfied
  }
  return annual.deadline < quarterly.deadline ? annual : quarterly;
}

export function evaluateReviewDue(
  coverage: PairCoverage,
  now: Date,
): ReviewDueEvaluation {
  if (
    coverage.lastBeforeSinceAt === null &&
    coverage.recentCoveringAt.length === 0
  ) {
    return NEVER_REVIEWED;
  }
  const today = madridDate(now);
  const current = quarterOf(today);
  return worseOf(
    evaluateQuarterly(coverage, current),
    evaluateAnnual(coverage, today, current),
  );
}

// The fields the list order depends on. Structural, so the use case's row
// model satisfies it without the domain knowing about rows or DTOs.
export interface ScheduleSortKey {
  status: ScheduleStatus;
  communityName: string;
  elementType: string;
  communityId: string;
}

// Worst first. Distinct from SEVERITY above: that ranks which obligation
// drives a pair, this ranks the list (NEVER_REVIEWED sits between OVERDUE and
// UPCOMING, as the spec orders it).
const LIST_RANK: Record<ScheduleStatus, number> = {
  OVERDUE: 0,
  NEVER_REVIEWED: 1,
  UPCOMING: 2,
  UP_TO_DATE: 3,
};

// One fixed-locale collator (design Decision 8): case- and accent-insensitive
// and independent of the server's default locale, so the order is identical
// across environments. Module-level because constructing one is costly.
const NAME_COLLATOR = new Intl.Collator('es', { sensitivity: 'base' });

// Total order for the schedule: status rank, then community name (collated),
// then element type, then community id as the deterministic tie-break.
export function compareScheduleRows(
  a: ScheduleSortKey,
  b: ScheduleSortKey,
): number {
  return (
    LIST_RANK[a.status] - LIST_RANK[b.status] ||
    NAME_COLLATOR.compare(a.communityName, b.communityName) ||
    compareOrdinal(a.elementType, b.elementType) ||
    compareOrdinal(a.communityId, b.communityId)
  );
}

function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
