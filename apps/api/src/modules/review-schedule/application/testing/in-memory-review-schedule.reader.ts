import type {
  ReviewScheduleReader,
  SchedulePair,
  ScheduleScope,
} from '../ports/review-schedule.reader.port';

// Test double for ReviewScheduleReader. Returns the pairs it was seeded with,
// filtered by scope exactly as the Prisma adapter filters by community id.
// `calls` lets a use case test assert that an empty scope never reaches the
// reader.
export class InMemoryReviewScheduleReader implements ReviewScheduleReader {
  readonly calls: { scope: ScheduleScope; since: Date }[] = [];
  private readonly pairs: SchedulePair[] = [];

  seed(...pairs: SchedulePair[]): void {
    this.pairs.push(...pairs);
  }

  listPairs(scope: ScheduleScope, since: Date): Promise<SchedulePair[]> {
    this.calls.push({ scope, since });
    if (scope.kind === 'all') {
      return Promise.resolve([...this.pairs]);
    }
    const allowed = new Set(scope.communityIds);
    return Promise.resolve(
      this.pairs.filter((pair) => allowed.has(pair.communityId)),
    );
  }
}
