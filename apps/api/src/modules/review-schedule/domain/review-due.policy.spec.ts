import { coverageWindowStart } from './calendar-quarter';
import {
  evaluateReviewDue,
  type PairCoverage,
  type ReviewDueEvaluation,
} from './review-due.policy';

// review-schedule spec: NEVER_REVIEWED Is Exclusive, The Quarterly Obligation,
// The Annual Obligation, One Combined Status per Pair, and the "Status changes
// with time alone" scenario. Test names follow the scenario names.
//
// Unless stated, today is 15 November 2026: current quarter Q4 2026, previous
// quarter Q3 2026. Sessions are given as covering sessions and folded into a
// `PairCoverage` the way the reader will (q4 / q5 / q6, design Data Flow), so
// the window superset of `coverageWindowStart` is exercised for real.

const NOW = '2026-11-15T10:00:00Z';

type CoveringFrequency = 'QUARTERLY' | 'ANNUAL';
interface Session {
  date: string; // YYYY-MM-DD, completed at 12:00 UTC (same Madrid date)
  frequency: CoveringFrequency;
}

const quarterly = (date: string): Session => ({ date, frequency: 'QUARTERLY' });
const annual = (date: string): Session => ({ date, frequency: 'ANNUAL' });
const at = (date: string): Date => new Date(`${date}T12:00:00Z`);

function coverageOf(sessions: Session[], now: string): PairCoverage {
  const since = coverageWindowStart(new Date(now)).getTime();
  const before = sessions.filter((s) => at(s.date).getTime() < since);
  const recent = sessions.filter((s) => at(s.date).getTime() >= since);
  const annuals = sessions.filter((s) => s.frequency === 'ANNUAL');
  const latest = (list: Session[]): Date | null =>
    list.length === 0
      ? null
      : new Date(Math.max(...list.map((s) => at(s.date).getTime())));
  return {
    lastBeforeSinceAt: latest(before),
    lastAnnualAt: latest(annuals),
    recentCoveringAt: recent.map((s) => at(s.date)),
  };
}

function evaluate(sessions: Session[], now: string = NOW): ReviewDueEvaluation {
  return evaluateReviewDue(coverageOf(sessions, now), new Date(now));
}

const overdueQuarter = (
  year: number,
  number: 1 | 2 | 3 | 4,
  deadline: string,
): ReviewDueEvaluation => ({
  status: 'OVERDUE',
  reasonCode: 'QUARTER_MISSED',
  quarter: { year, number },
  deadline,
});
const dueQuarter = (
  year: number,
  number: 1 | 2 | 3 | 4,
  deadline: string,
): ReviewDueEvaluation => ({
  status: 'UPCOMING',
  reasonCode: 'QUARTER_DUE',
  quarter: { year, number },
  deadline,
});
const annualOverdue = (deadline: string): ReviewDueEvaluation => ({
  status: 'OVERDUE',
  reasonCode: 'ANNUAL_OVERDUE',
  quarter: null,
  deadline,
});
const annualDue = (deadline: string): ReviewDueEvaluation => ({
  status: 'UPCOMING',
  reasonCode: 'ANNUAL_DUE',
  quarter: null,
  deadline,
});
const annualNotOnRecord = (deadline: string): ReviewDueEvaluation => ({
  status: 'UPCOMING',
  reasonCode: 'ANNUAL_NOT_ON_RECORD',
  quarter: null,
  deadline,
});
const UP_TO_DATE: ReviewDueEvaluation = {
  status: 'UP_TO_DATE',
  reasonCode: 'UP_TO_DATE',
  quarter: null,
  deadline: null,
};
const NEVER_REVIEWED: ReviewDueEvaluation = {
  status: 'NEVER_REVIEWED',
  reasonCode: 'NEVER_REVIEWED',
  quarter: null,
  deadline: null,
};

describe('evaluateReviewDue', () => {
  describe('NEVER_REVIEWED Is Exclusive and Makes No Overdue Claim', () => {
    it('No covering session ever', () => {
      expect(evaluate([])).toEqual(NEVER_REVIEWED);
    });

    it('Element type without a usable template (only MONTHLY/SEMIANNUAL sessions reach the policy as empty coverage)', () => {
      const emptyCoverage: PairCoverage = {
        lastBeforeSinceAt: null,
        lastAnnualAt: null,
        recentCoveringAt: [],
      };
      expect(evaluateReviewDue(emptyCoverage, new Date(NOW))).toEqual(
        NEVER_REVIEWED,
      );
    });

    it.each([
      ['only a pre-window session, dated 2025', [quarterly('2025-06-10')]],
      ['only a recent session, dated 2026', [quarterly('2026-08-10')]],
      ['only an ANNUAL session, dated 2025', [annual('2025-03-01')]],
    ])('Any covering session removes the status: %s', (_label, sessions) => {
      expect(evaluate(sessions).status).not.toBe('NEVER_REVIEWED');
    });
  });

  describe('The Quarterly Obligation', () => {
    it('First session two quarters back, previous quarter missed', () => {
      expect(evaluate([quarterly('2026-05-10')])).toEqual(
        overdueQuarter(2026, 3, '2026-09-30'),
      );
    });

    it('First session in the previous quarter', () => {
      // Quarterly: Q3 covered, Q4 open -> UPCOMING Q4, deadline 31 Dec. The
      // annual "not on record" has the same deadline, so quarterly drives.
      expect(evaluate([quarterly('2026-08-10')])).toEqual(
        dueQuarter(2026, 4, '2026-12-31'),
      );
    });

    it('First session in the current quarter', () => {
      // Quarterly satisfied; UPCOMING comes from the annual obligation.
      expect(evaluate([quarterly('2026-10-10')])).toEqual(
        annualNotOnRecord('2026-12-31'),
      );
    });

    it('Earlier gaps are not judged', () => {
      expect(evaluate([annual('2026-03-20'), quarterly('2026-08-10')])).toEqual(
        // Missed Q2 not reported; annual deadline 20 Mar 2027 is satisfied.
        dueQuarter(2026, 4, '2026-12-31'),
      );
    });

    it('Missed previous quarter, current quarter still open', () => {
      expect(evaluate([quarterly('2026-04-20')])).toEqual(
        overdueQuarter(2026, 3, '2026-09-30'),
      );
    });

    it('Missed previous quarter clears once the current quarter is covered', () => {
      expect(
        evaluate([quarterly('2026-05-10'), quarterly('2026-10-10')]),
      ).toEqual(annualNotOnRecord('2026-12-31'));
    });

    it('The previous quarter crosses a year boundary', () => {
      expect(
        evaluate([quarterly('2026-08-10')], '2027-01-10T09:00:00Z'),
      ).toEqual(overdueQuarter(2026, 4, '2026-12-31'));
    });

    describe('Decision 5 table, the four rows (Q4 current)', () => {
      it.each([
        ['Q2 first, Q3 and Q4 uncovered', ['2026-05-10'], 'OVERDUE'],
        [
          'Q2 first, Q3 uncovered, Q4 covered',
          ['2026-05-10', '2026-10-10'],
          'UPCOMING',
        ],
        ['Q3 first, Q4 uncovered', ['2026-08-10'], 'UPCOMING'],
        ['Q4 first', ['2026-10-10'], 'UPCOMING'],
      ])('%s', (_label, dates, status) => {
        expect(evaluate(dates.map(quarterly)).status).toBe(status);
      });

      it('Q2 first, Q3 uncovered, Q4 covered: the quarterly obligation is satisfied (UP_TO_DATE once the annual is satisfied)', () => {
        expect(
          evaluate([
            quarterly('2026-05-10'),
            quarterly('2026-10-10'),
            annual('2026-03-20'),
          ]),
        ).toEqual(UP_TO_DATE);
      });
    });

    describe('window superset narrowed to Madrid quarters', () => {
      it('a session on 30 Jun (inside the window superset) is before the previous quarter and still counts as earlier history', () => {
        // since is 2026-06-30T00:00Z, so this session is a recent date in
        // the superset but belongs to Q2, not Q3.
        expect(evaluate([quarterly('2026-06-30')])).toEqual(
          overdueQuarter(2026, 3, '2026-09-30'),
        );
      });

      it('a session at 23:30 UTC on 30 Jun is 1 Jul in Madrid and covers Q3', () => {
        const coverage: PairCoverage = {
          lastBeforeSinceAt: null,
          lastAnnualAt: null,
          recentCoveringAt: [new Date('2026-06-30T23:30:00Z')],
        };
        expect(evaluateReviewDue(coverage, new Date(NOW))).toEqual(
          dueQuarter(2026, 4, '2026-12-31'),
        );
      });

      it('"today" is the Madrid date: 22:30 UTC on 30 Sep is already Q4', () => {
        const sessions = [quarterly('2026-08-10')];
        // 23:30 in Madrid on 30 Sep: Q3 is current and covered, so only the
        // annual obligation (deadline = end of Q3) is open.
        expect(evaluate(sessions, '2026-09-30T21:30:00Z')).toEqual(
          annualNotOnRecord('2026-09-30'),
        );
        expect(evaluate(sessions, '2026-09-30T22:30:00Z')).toEqual(
          dueQuarter(2026, 4, '2026-12-31'),
        );
      });
    });
  });

  describe('The Annual Obligation', () => {
    // Both Q3 and Q4 2026 covered, so the quarterly obligation is satisfied.
    const covered = [quarterly('2026-08-10'), quarterly('2026-10-10')];

    it('Deadline already passed', () => {
      expect(evaluate([annual('2025-10-10'), ...covered])).toEqual(
        annualOverdue('2026-10-10'),
      );
    });

    it('Deadline falls inside the current quarter', () => {
      expect(evaluate([annual('2025-12-01'), ...covered])).toEqual(
        annualDue('2026-12-01'),
      );
    });

    it('Deadline later than the current quarter', () => {
      expect(evaluate([annual('2026-03-20'), ...covered])).toEqual(UP_TO_DATE);
    });

    it('Deadline exactly today is not overdue (inclusive)', () => {
      const sessions = [annual('2025-11-15'), ...covered];
      expect(evaluate(sessions, '2026-11-15T10:00:00Z')).toEqual(
        annualDue('2026-11-15'),
      );
      expect(evaluate(sessions, '2026-11-16T10:00:00Z')).toEqual(
        annualOverdue('2026-11-15'),
      );
    });

    it('Deadline day is judged on the Madrid date, not the UTC date', () => {
      const sessions = [annual('2025-11-15'), ...covered];
      // 23:30 UTC on 14 Nov is 00:30 on 15 Nov in Madrid: the deadline day.
      expect(evaluate(sessions, '2026-11-14T23:30:00Z')).toEqual(
        annualDue('2026-11-15'),
      );
      // 23:30 UTC on 15 Nov is 00:30 on 16 Nov in Madrid: the day after.
      expect(evaluate(sessions, '2026-11-15T23:30:00Z')).toEqual(
        annualOverdue('2026-11-15'),
      );
    });

    it('The annual session date is its Madrid calendar date, not its UTC date', () => {
      // Completed 23:30 UTC on 14 Nov 2025 = 00:30 on 15 Nov in Madrid, so
      // the deadline is 15 Nov 2026 (not 14 Nov).
      const coverage: PairCoverage = {
        lastBeforeSinceAt: null,
        lastAnnualAt: new Date('2025-11-14T23:30:00Z'),
        recentCoveringAt: covered.map((s) => at(s.date)),
      };
      expect(evaluateReviewDue(coverage, new Date(NOW))).toEqual(
        annualDue('2026-11-15'),
      );
    });

    it('A 29 February anniversary falls on 28 February', () => {
      // Q1 2025 covered, so the quarterly obligation is satisfied.
      const sessions = [annual('2024-02-29'), quarterly('2025-01-10')];
      expect(evaluate(sessions, '2025-02-28T10:00:00Z')).toEqual(
        annualDue('2025-02-28'),
      );
      expect(evaluate(sessions, '2025-03-01T10:00:00Z')).toEqual(
        annualOverdue('2025-02-28'),
      );
    });

    it('Deadline on the last day of the current quarter versus the day after', () => {
      expect(evaluate([annual('2025-12-31'), ...covered])).toEqual(
        annualDue('2026-12-31'),
      );
      expect(evaluate([annual('2026-01-01'), ...covered])).toEqual(UP_TO_DATE);
    });

    it('Quarterly sessions and older annuals do not move the deadline', () => {
      // Latest ANNUAL is 20 Mar 2026, so the deadline is 20 Mar 2027; the
      // QUARTERLY session of 5 Nov 2026 and the ANNUAL of 10 Oct 2024 do not
      // change it. Read on 21 Mar 2027 (Q1 2027 covered, Q4 2026 covered).
      const sessions = [
        annual('2024-10-10'),
        annual('2026-03-20'),
        quarterly('2026-11-05'),
        quarterly('2027-02-10'),
      ];
      expect(evaluate(sessions, '2027-03-21T10:00:00Z')).toEqual(
        annualOverdue('2027-03-20'),
      );
      expect(evaluate(sessions, '2027-03-20T10:00:00Z')).toEqual(
        annualDue('2027-03-20'),
      );
    });

    it('No annual on record', () => {
      expect(evaluate(covered)).toEqual(annualNotOnRecord('2026-12-31'));
    });

    it.each([
      [
        '2026-11-15T10:00:00Z',
        ['2026-04-10', '2026-08-10', '2026-10-10'],
        '2026-12-31',
      ],
      [
        '2027-02-10T10:00:00Z',
        ['2026-08-10', '2026-10-10', '2027-01-20'],
        '2027-03-31',
      ],
      [
        '2027-05-10T10:00:00Z',
        ['2026-10-10', '2027-01-20', '2027-04-20'],
        '2027-06-30',
      ],
    ])(
      'An element type with no ANNUAL template never reaches UP_TO_DATE (now %s)',
      (now, dates, deadline) => {
        expect(evaluate(dates.map(quarterly), now)).toEqual(
          annualNotOnRecord(deadline),
        );
      },
    );
  });

  describe('One Combined Status per Pair', () => {
    it('Quarterly overdue beats annual upcoming', () => {
      // Annual: not on record (UPCOMING). Quarterly: Q3 missed (OVERDUE).
      expect(evaluate([quarterly('2026-05-10')])).toEqual(
        overdueQuarter(2026, 3, '2026-09-30'),
      );
    });

    it('Annual overdue beats quarterly upcoming', () => {
      expect(evaluate([annual('2025-10-10'), quarterly('2026-08-10')])).toEqual(
        annualOverdue('2026-10-10'),
      );
    });

    it('Both obligations overdue, the quarterly deadline is earlier', () => {
      // Quarterly Q3 deadline 30 Sep 2026; annual deadline 20 Oct 2026.
      expect(evaluate([annual('2025-10-20')])).toEqual(
        overdueQuarter(2026, 3, '2026-09-30'),
      );
    });

    it('Both obligations overdue, the annual deadline is earlier', () => {
      // Quarterly Q3 deadline 30 Sep 2026; annual deadline 10 Aug 2026.
      expect(evaluate([annual('2025-08-10')])).toEqual(
        annualOverdue('2026-08-10'),
      );
    });

    it('Equal statuses are driven by the earlier deadline', () => {
      expect(evaluate([annual('2025-12-01'), quarterly('2026-08-10')])).toEqual(
        annualDue('2026-12-01'),
      );
    });

    it('Equal statuses and equal deadlines are driven by the quarterly obligation', () => {
      expect(evaluate([annual('2025-12-31'), quarterly('2026-08-10')])).toEqual(
        dueQuarter(2026, 4, '2026-12-31'),
      );
    });

    it('Up to date carries no driving obligation and no deadline', () => {
      expect(
        evaluate([
          annual('2026-03-20'),
          quarterly('2026-08-10'),
          quarterly('2026-10-10'),
        ]),
      ).toEqual(UP_TO_DATE);
    });

    it('Never reviewed carries nothing', () => {
      const result = evaluate([]);
      expect(result.reasonCode).toBe('NEVER_REVIEWED');
      expect(result.quarter).toBeNull();
      expect(result.deadline).toBeNull();
    });
  });

  describe('Status changes with time alone', () => {
    it('same coverage is UP_TO_DATE on 15 Nov 2026 and UPCOMING on 2 Jan 2027', () => {
      // Only covering session: ANNUAL dated 10 Oct 2026 (annual deadline
      // 10 Oct 2027 is later than every quarter end involved).
      const sessions = [annual('2026-10-10')];
      expect(evaluate(sessions, '2026-11-15T10:00:00Z')).toEqual(UP_TO_DATE);
      expect(evaluate(sessions, '2027-01-02T10:00:00Z')).toEqual(
        dueQuarter(2027, 1, '2027-03-31'),
      );
    });
  });

  it('does not mutate the coverage it is given', () => {
    const coverage = coverageOf([quarterly('2026-05-10')], NOW);
    const snapshot = JSON.stringify(coverage);
    evaluateReviewDue(coverage, new Date(NOW));
    expect(JSON.stringify(coverage)).toBe(snapshot);
  });
});
