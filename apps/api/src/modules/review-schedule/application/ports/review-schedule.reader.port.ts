import type { ElementType } from '../../../inspectable-element/domain/element-type';
import type { PairCoverage } from '../../domain/review-due.policy';

// Module-local read port (design.md Decision 6), owned by its consumer. It
// returns every (community, elementType) pair in scope with its coverage
// facts in a fixed number of queries, whatever the result size. It applies no
// quarter logic: the pure due policy narrows the facts.
//
// `PairCoverage` is declared in the domain (tasks.md design deviation), so the
// domain never imports from `application/`.

export type ScheduleScope =
  { kind: 'all' } | { kind: 'communities'; communityIds: readonly string[] };

export interface SchedulePair {
  communityId: string;
  communityName: string;
  elementType: ElementType;
  coverage: PairCoverage;
}

export interface ReviewScheduleReader {
  // `since` is `coverageWindowStart(now)`: coverage dates from `since` on come
  // back individually, older history is reduced to two facts per pair.
  listPairs(scope: ScheduleScope, since: Date): Promise<SchedulePair[]>;
}

export const REVIEW_SCHEDULE_READER = Symbol('REVIEW_SCHEDULE_READER');
