import { FakeCommunityScopeChecker } from '../../../review-session/application/use-cases/testing/fake-community-scope.checker';
import { FakeManagerCapabilityChecker } from '../../../review-session/application/use-cases/testing/fake-manager-capability.checker';
import { FixedClock } from '../../../../shared/testing/fixed-clock';
import type { Role } from '../../../users/domain/role';
import { coverageWindowStart } from '../../domain/calendar-quarter';
import type { PairCoverage } from '../../domain/review-due.policy';
import type { SchedulePair } from '../ports/review-schedule.reader.port';
import { InMemoryReviewScheduleReader } from '../testing/in-memory-review-schedule.reader';
import {
  ListReviewScheduleUseCase,
  type ReviewScheduleRow,
} from './list-review-schedule.use-case';

// review-schedule spec: Every Pair in Scope Is Listed, Worst First; Scope
// Follows the Caller's Role; Last covering session date is a Madrid calendar
// date; Never reviewed carries nothing; Up to date shows the last session
// only; Nothing is hidden; Empty scope. The due rule itself is covered by
// review-due.policy.spec.ts, so these tests only need one coverage shape per
// status.
//
// Today is 15 November 2026 (current quarter Q4 2026, previous Q3 2026).
const NOW = new Date('2026-11-15T10:00:00Z');

const date = (iso: string): Date => new Date(iso);

// UP_TO_DATE: an ANNUAL session this quarter covers both obligations.
const UP_TO_DATE: PairCoverage = {
  lastBeforeSinceAt: null,
  lastAnnualAt: date('2026-10-10T12:00:00Z'),
  recentCoveringAt: [date('2026-10-10T12:00:00Z')],
};
// OVERDUE QUARTER_MISSED(Q3 2026): a Q2 session only.
const OVERDUE: PairCoverage = {
  lastBeforeSinceAt: date('2026-05-10T12:00:00Z'),
  lastAnnualAt: null,
  recentCoveringAt: [],
};
// UPCOMING QUARTER_DUE(Q4 2026): Q3 covered, Q4 not, no annual on record.
const UPCOMING: PairCoverage = {
  lastBeforeSinceAt: null,
  lastAnnualAt: null,
  recentCoveringAt: [date('2026-08-10T12:00:00Z')],
};
const NEVER_REVIEWED: PairCoverage = {
  lastBeforeSinceAt: null,
  lastAnnualAt: null,
  recentCoveringAt: [],
};

const pair = (
  communityId: string,
  communityName: string,
  coverage: PairCoverage,
): SchedulePair => ({
  communityId,
  communityName,
  elementType: 'EXTINGUISHER',
  coverage,
});

interface Harness {
  reader: InMemoryReviewScheduleReader;
  communityScope: FakeCommunityScopeChecker;
  capability: FakeManagerCapabilityChecker;
  clock: FixedClock;
  useCase: ListReviewScheduleUseCase;
}

function build(): Harness {
  const reader = new InMemoryReviewScheduleReader();
  const communityScope = new FakeCommunityScopeChecker();
  const capability = new FakeManagerCapabilityChecker();
  const clock = new FixedClock(NOW);
  return {
    reader,
    communityScope,
    capability,
    clock,
    useCase: new ListReviewScheduleUseCase(
      reader,
      communityScope,
      capability,
      clock,
    ),
  };
}

const ids = (rows: ReviewScheduleRow[]): string[] =>
  rows.map((row) => row.communityId);

describe('ListReviewScheduleUseCase', () => {
  let h: Harness;

  beforeEach(() => {
    h = build();
  });

  describe("Scope Follows the Caller's Role", () => {
    beforeEach(() => {
      h.reader.seed(
        pair('c-a', 'Alpha', UP_TO_DATE),
        pair('c-b', 'Beta', OVERDUE),
        pair('c-c', 'Gamma', UPCOMING),
      );
    });

    it('Admin and granted manager see everything, in the same order', async () => {
      h.capability.grant('manager-1');

      const admin = await h.useCase.execute({
        userId: 'admin-1',
        role: 'SYSTEM_ADMIN',
      });
      const manager = await h.useCase.execute({
        userId: 'manager-1',
        role: 'MANAGER',
      });

      expect(ids(admin)).toEqual(['c-b', 'c-c', 'c-a']);
      expect(manager).toEqual(admin);
      expect(h.reader.calls.map((call) => call.scope)).toEqual([
        { kind: 'all' },
        { kind: 'all' },
      ]);
    });

    it('reads the window starting at coverageWindowStart(now)', async () => {
      await h.useCase.execute({ userId: 'admin-1', role: 'SYSTEM_ADMIN' });

      expect(h.reader.calls).toHaveLength(1);
      expect(h.reader.calls[0].since).toEqual(coverageWindowStart(NOW));
    });

    it('Ungranted manager sees an empty list and no data is read', async () => {
      const result = await h.useCase.execute({
        userId: 'manager-2',
        role: 'MANAGER',
      });

      expect(result).toEqual([]);
      expect(h.reader.calls).toHaveLength(0);
    });

    it('Revoking the capability takes effect on the next read', async () => {
      h.capability.grant('manager-1');
      const actor = { userId: 'manager-1', role: 'MANAGER' as const };
      const first = await h.useCase.execute(actor);
      expect(first).toHaveLength(3);

      jest.spyOn(h.capability, 'hasManagerCapability').mockResolvedValue(false);
      const second = await h.useCase.execute(actor);

      expect(second).toEqual([]);
      expect(h.reader.calls).toHaveLength(1);
    });

    it('A soft-deleted manager resolves to an empty scope and no data is read', async () => {
      // The checker adapter answers false for a soft-deleted user whatever the
      // stored capability says (user-manager-capability.checker.spec.ts).
      h.capability.grant('manager-1');
      jest.spyOn(h.capability, 'hasManagerCapability').mockResolvedValue(false);

      const result = await h.useCase.execute({
        userId: 'manager-1',
        role: 'MANAGER',
      });

      expect(result).toEqual([]);
      expect(h.reader.calls).toHaveLength(0);
    });

    it('A failure to resolve the capability is an error, not an empty list', async () => {
      jest
        .spyOn(h.capability, 'hasManagerCapability')
        .mockRejectedValue(new Error('connection lost'));
      const readerSpy = jest.spyOn(h.reader, 'listPairs');

      await expect(
        h.useCase.execute({ userId: 'manager-1', role: 'MANAGER' }),
      ).rejects.toThrow('connection lost');
      expect(readerSpy).not.toHaveBeenCalled();
    });

    it('Representative sees assigned communities only', async () => {
      h.communityScope.assign('rep-1', 'c-a');

      const result = await h.useCase.execute({
        userId: 'rep-1',
        role: 'COMMUNITY_REPRESENTATIVE',
      });

      expect(ids(result)).toEqual(['c-a']);
      expect(h.reader.calls[0].scope).toEqual({
        kind: 'communities',
        communityIds: ['c-a'],
      });
    });

    it('Technician scope is assignment-based', async () => {
      // T is assigned to A and performed nothing there. T performed a session
      // in B without an active assignment: the use case never looks at
      // performers, so B stays out.
      h.communityScope.assign('tech-1', 'c-a');

      const result = await h.useCase.execute({
        userId: 'tech-1',
        role: 'MAINTENANCE_TECHNICIAN',
      });

      expect(ids(result)).toEqual(['c-a']);
      expect(h.reader.calls[0].scope).toEqual({
        kind: 'communities',
        communityIds: ['c-a'],
      });
    });

    it('a technician assigned to two communities sees both, worst first', async () => {
      h.communityScope.assign('tech-1', 'c-a');
      h.communityScope.assign('tech-1', 'c-b');

      const result = await h.useCase.execute({
        userId: 'tech-1',
        role: 'MAINTENANCE_TECHNICIAN',
      });

      expect(ids(result)).toEqual(['c-b', 'c-a']);
    });

    it.each<Role>(['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'])(
      'Deactivated assignment removes scope: a %s with no active assignment sees nothing and no data is read',
      async (role) => {
        // An assignment that was deactivated is simply absent from
        // listAssignedCommunityIds; the fake holds none for this user.
        const result = await h.useCase.execute({ userId: 'user-9', role });

        expect(result).toEqual([]);
        expect(h.reader.calls).toHaveLength(0);
      },
    );

    it('a company manager gets an empty list, resolves no scope and reads nothing', async () => {
      const capabilitySpy = jest.spyOn(h.capability, 'hasManagerCapability');
      const scopeSpy = jest.spyOn(h.communityScope, 'listAssignedCommunityIds');

      const result = await h.useCase.execute({
        userId: 'cm-1',
        role: 'MAINTENANCE_COMPANY_MANAGER',
      });

      expect(result).toEqual([]);
      expect(capabilitySpy).not.toHaveBeenCalled();
      expect(scopeSpy).not.toHaveBeenCalled();
      expect(h.reader.calls).toHaveLength(0);
    });

    it('an unknown role from a forged claim fails closed', async () => {
      const result = await h.useCase.execute({
        userId: 'x-1',
        role: 'SUPER_USER' as unknown as Role,
      });

      expect(result).toEqual([]);
      expect(h.reader.calls).toHaveLength(0);
    });
  });

  describe('Every Pair in Scope Is Listed, Worst First', () => {
    const admin = { userId: 'admin-1', role: 'SYSTEM_ADMIN' as const };

    it('sorts with compareScheduleRows even when the reader returns pairs unsorted', async () => {
      // The reader's order is undefined by contract; feed it worst-last and
      // out of name order.
      h.reader.seed(
        pair('c-1', 'Zeta', UP_TO_DATE),
        pair('c-2', 'alpha', UPCOMING),
        pair('c-3', 'Beta', NEVER_REVIEWED),
        pair('c-4', 'Àgora', UPCOMING),
        pair('c-5', 'Omega', OVERDUE),
      );

      const result = await h.useCase.execute(admin);

      expect(result.map((row) => [row.status, row.communityName])).toEqual([
        ['OVERDUE', 'Omega'],
        ['NEVER_REVIEWED', 'Beta'],
        ['UPCOMING', 'Àgora'],
        ['UPCOMING', 'alpha'],
        ['UP_TO_DATE', 'Zeta'],
      ]);
    });

    it('Nothing is hidden: four UP_TO_DATE pairs are all returned', async () => {
      h.reader.seed(
        pair('c-1', 'D', UP_TO_DATE),
        pair('c-2', 'C', UP_TO_DATE),
        pair('c-3', 'B', UP_TO_DATE),
        pair('c-4', 'A', UP_TO_DATE),
      );

      const result = await h.useCase.execute(admin);

      expect(ids(result)).toEqual(['c-4', 'c-3', 'c-2', 'c-1']);
      expect(result.every((row) => row.status === 'UP_TO_DATE')).toBe(true);
    });

    it('Empty scope: a scope that holds no pair is an empty list', async () => {
      const result = await h.useCase.execute(admin);

      expect(result).toEqual([]);
      expect(h.reader.calls).toHaveLength(1); // scope was non-empty: read ran
    });

    it('carries the evaluation of each pair into its row', async () => {
      h.reader.seed(
        pair('c-5', 'Omega', OVERDUE),
        pair('c-2', 'Beta', UPCOMING),
      );

      const result = await h.useCase.execute(admin);

      expect(result).toEqual([
        {
          communityId: 'c-5',
          communityName: 'Omega',
          elementType: 'EXTINGUISHER',
          status: 'OVERDUE',
          reasonCode: 'QUARTER_MISSED',
          quarter: { year: 2026, number: 3 },
          deadline: '2026-09-30',
          lastCoveringSessionDate: '2026-05-10',
        },
        {
          communityId: 'c-2',
          communityName: 'Beta',
          elementType: 'EXTINGUISHER',
          status: 'UPCOMING',
          reasonCode: 'QUARTER_DUE',
          quarter: { year: 2026, number: 4 },
          deadline: '2026-12-31',
          lastCoveringSessionDate: '2026-08-10',
        },
      ]);
    });

    it('reads now from the clock exactly once per call', async () => {
      h.reader.seed(pair('c-1', 'A', UP_TO_DATE), pair('c-2', 'B', OVERDUE));
      const nowSpy = jest.spyOn(h.clock, 'now');

      await h.useCase.execute(admin);

      expect(nowSpy).toHaveBeenCalledTimes(1);
    });

    it('evaluates against the clock: the same coverage changes status with time alone', async () => {
      h.reader.seed(pair('c-1', 'A', UP_TO_DATE));
      expect((await h.useCase.execute(admin))[0].status).toBe('UP_TO_DATE');

      h.clock.advanceTo(date('2027-01-02T10:00:00Z'));
      const later = await h.useCase.execute(admin);

      expect(later[0].status).toBe('UPCOMING');
      expect(later[0].reasonCode).toBe('QUARTER_DUE');
    });

    it('does not modify what the reader returned', async () => {
      h.reader.seed(pair('c-1', 'A', UP_TO_DATE), pair('c-2', 'B', OVERDUE));
      const before = JSON.stringify(
        await h.reader.listPairs({ kind: 'all' }, NOW),
      );

      await h.useCase.execute(admin);

      expect(
        JSON.stringify(await h.reader.listPairs({ kind: 'all' }, NOW)),
      ).toBe(before);
    });
  });

  describe('last covering session date', () => {
    const admin = { userId: 'admin-1', role: 'SYSTEM_ADMIN' as const };

    it('The last covering session date is a Madrid calendar date', async () => {
      // 22:30 UTC on 14 Nov is 23:30 on 14 Nov in Madrid (CET, UTC+1);
      // 23:30 UTC on 14 Nov is 00:30 on 15 Nov in Madrid.
      const covering = (at: string): PairCoverage => ({
        lastBeforeSinceAt: null,
        lastAnnualAt: null,
        recentCoveringAt: [date(at)],
      });
      h.reader.seed(
        pair('c-1', 'First', covering('2026-11-14T22:30:00Z')),
        pair('c-2', 'Second', covering('2026-11-14T23:30:00Z')),
      );

      const result = await h.useCase.execute(admin);

      const byId = new Map(result.map((row) => [row.communityId, row]));
      expect(byId.get('c-1')?.lastCoveringSessionDate).toBe('2026-11-14');
      expect(byId.get('c-2')?.lastCoveringSessionDate).toBe('2026-11-15');
    });

    it('uses the latest of the in-window sessions, whatever their order', async () => {
      h.reader.seed(
        pair('c-1', 'A', {
          lastBeforeSinceAt: date('2026-05-10T12:00:00Z'),
          lastAnnualAt: null,
          recentCoveringAt: [
            date('2026-08-10T12:00:00Z'),
            date('2026-10-02T12:00:00Z'),
            date('2026-09-01T12:00:00Z'),
          ],
        }),
      );

      const [row] = await h.useCase.execute(admin);

      expect(row.lastCoveringSessionDate).toBe('2026-10-02');
    });

    it('falls back to the pre-window session when the window holds none', async () => {
      h.reader.seed(pair('c-1', 'A', OVERDUE));

      const [row] = await h.useCase.execute(admin);

      expect(row.lastCoveringSessionDate).toBe('2026-05-10');
    });

    it('Up to date shows the last session only: no driving obligation and no deadline', async () => {
      h.reader.seed(pair('c-1', 'A', UP_TO_DATE));

      const [row] = await h.useCase.execute(admin);

      expect(row).toEqual({
        communityId: 'c-1',
        communityName: 'A',
        elementType: 'EXTINGUISHER',
        status: 'UP_TO_DATE',
        reasonCode: 'UP_TO_DATE',
        quarter: null,
        deadline: null,
        lastCoveringSessionDate: '2026-10-10',
      });
    });

    it('Never reviewed carries nothing: no obligation, no deadline, no last date', async () => {
      h.reader.seed(pair('c-1', 'A', NEVER_REVIEWED));

      const [row] = await h.useCase.execute(admin);

      expect(row).toEqual({
        communityId: 'c-1',
        communityName: 'A',
        elementType: 'EXTINGUISHER',
        status: 'NEVER_REVIEWED',
        reasonCode: 'NEVER_REVIEWED',
        quarter: null,
        deadline: null,
        lastCoveringSessionDate: null,
      });
    });
  });
});
