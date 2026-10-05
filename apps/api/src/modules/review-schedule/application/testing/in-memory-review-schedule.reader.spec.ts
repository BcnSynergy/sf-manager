import type { SchedulePair } from '../ports/review-schedule.reader.port';
import { InMemoryReviewScheduleReader } from './in-memory-review-schedule.reader';

const since = new Date('2026-06-30T00:00:00Z');

const pair = (
  communityId: string,
  elementType = 'EXTINGUISHER',
): SchedulePair => ({
  communityId,
  communityName: `Community ${communityId}`,
  elementType: elementType as SchedulePair['elementType'],
  coverage: {
    lastBeforeSinceAt: null,
    lastAnnualAt: null,
    recentCoveringAt: [],
  },
});

describe('InMemoryReviewScheduleReader', () => {
  it('returns every seeded pair for the all scope', async () => {
    const reader = new InMemoryReviewScheduleReader();
    reader.seed(pair('a'), pair('b'));

    const result = await reader.listPairs({ kind: 'all' }, since);

    expect(result.map((p) => p.communityId)).toEqual(['a', 'b']);
  });

  it('returns only pairs of the listed communities for a communities scope', async () => {
    const reader = new InMemoryReviewScheduleReader();
    reader.seed(pair('a'), pair('b'), pair('c'));

    const result = await reader.listPairs(
      { kind: 'communities', communityIds: ['a', 'c'] },
      since,
    );

    expect(result.map((p) => p.communityId)).toEqual(['a', 'c']);
  });

  it('returns nothing for an empty communities scope', async () => {
    const reader = new InMemoryReviewScheduleReader();
    reader.seed(pair('a'));

    await expect(
      reader.listPairs({ kind: 'communities', communityIds: [] }, since),
    ).resolves.toEqual([]);
  });

  it('records every call so a use case test can assert the reader was not called', async () => {
    const reader = new InMemoryReviewScheduleReader();
    expect(reader.calls).toEqual([]);

    await reader.listPairs({ kind: 'all' }, since);

    expect(reader.calls).toEqual([{ scope: { kind: 'all' }, since }]);
  });
});
