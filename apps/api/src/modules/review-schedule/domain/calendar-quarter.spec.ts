import {
  addTwelveMonths,
  coverageWindowStart,
  madridDate,
  previousQuarter,
  quarterEnd,
  quarterOf,
  type Quarter,
} from './calendar-quarter';

// design.md Decisions 5 and 6: every judgement uses Europe/Madrid calendar
// dates, so the quarter edges and the DST changes are tested explicitly.

const q = (year: number, number: Quarter['number']): Quarter => ({
  year,
  number,
});

describe('madridDate', () => {
  it.each([
    // Summer time (UTC+2): 22:00 UTC is already midnight in Madrid.
    ['2026-09-30T21:30:00Z', '2026-09-30'],
    ['2026-09-30T22:00:00Z', '2026-10-01'],
    ['2026-09-30T22:30:00Z', '2026-10-01'],
    ['2026-09-30T23:30:00Z', '2026-10-01'],
    // Winter time (UTC+1): 23:00 UTC is already midnight in Madrid.
    ['2026-12-31T22:30:00Z', '2026-12-31'],
    ['2026-12-31T23:00:00Z', '2027-01-01'],
    ['2026-12-31T23:30:00Z', '2027-01-01'],
    // Mid-day instants keep their UTC date.
    ['2026-09-30T12:00:00Z', '2026-09-30'],
    ['2026-10-01T12:00:00Z', '2026-10-01'],
  ])('%s is %s in Europe/Madrid', (instant, expected) => {
    expect(madridDate(new Date(instant))).toBe(expected);
  });

  it.each([
    // Spring forward 2026-03-29 01:00 UTC (02:00 -> 03:00 local).
    ['2026-03-28T22:59:59Z', '2026-03-28'],
    ['2026-03-28T23:00:00Z', '2026-03-29'],
    // Fall back 2026-10-25 01:00 UTC (03:00 -> 02:00 local).
    ['2026-10-24T21:59:59Z', '2026-10-24'],
    ['2026-10-24T22:00:00Z', '2026-10-25'],
    ['2026-10-25T22:59:59Z', '2026-10-25'],
    ['2026-10-25T23:00:00Z', '2026-10-26'],
  ])('%s is %s around a DST change', (instant, expected) => {
    expect(madridDate(new Date(instant))).toBe(expected);
  });
});

describe('quarterOf', () => {
  it.each([
    ['2026-01-01', q(2026, 1)],
    ['2026-03-31', q(2026, 1)],
    ['2026-04-01', q(2026, 2)],
    ['2026-06-30', q(2026, 2)],
    ['2026-07-01', q(2026, 3)],
    ['2026-09-30', q(2026, 3)],
    ['2026-10-01', q(2026, 4)],
    ['2026-12-31', q(2026, 4)],
  ])('%s belongs to %j', (date, expected) => {
    expect(quarterOf(date)).toEqual(expected);
  });
});

describe('previousQuarter', () => {
  it.each([
    [q(2026, 4), q(2026, 3)],
    [q(2026, 2), q(2026, 1)],
    [q(2027, 1), q(2026, 4)],
  ])('before %j comes %j', (quarter, expected) => {
    expect(previousQuarter(quarter)).toEqual(expected);
  });
});

describe('quarterEnd', () => {
  it.each([
    [q(2026, 1), '2026-03-31'],
    [q(2026, 2), '2026-06-30'],
    [q(2026, 3), '2026-09-30'],
    [q(2026, 4), '2026-12-31'],
  ])('%j ends on %s', (quarter, expected) => {
    expect(quarterEnd(quarter)).toBe(expected);
  });
});

describe('addTwelveMonths', () => {
  it.each([
    ['2025-11-15', '2026-11-15'],
    ['2025-12-31', '2026-12-31'],
    ['2026-01-01', '2027-01-01'],
    // A 29 February anniversary falls on 28 February.
    ['2024-02-29', '2025-02-28'],
    ['2023-02-28', '2024-02-28'],
  ])('%s plus twelve months is %s', (date, expected) => {
    expect(addTwelveMonths(date)).toBe(expected);
  });
});

describe('coverageWindowStart', () => {
  it.each([
    // Current Q4 2026: previous quarter starts 1 Jul, minus one day.
    ['2026-10-05T10:00:00Z', '2026-06-30T00:00:00.000Z'],
    // Each side of the autumn DST change (25 Oct 2026).
    ['2026-10-24T21:59:59Z', '2026-06-30T00:00:00.000Z'],
    ['2026-10-25T23:00:00Z', '2026-06-30T00:00:00.000Z'],
    // Each side of the spring DST change (29 Mar 2026): current Q1 2026.
    ['2026-03-28T22:59:59Z', '2025-09-30T00:00:00.000Z'],
    ['2026-03-28T23:00:00Z', '2025-09-30T00:00:00.000Z'],
    // Across the year boundary: 31 Dec 23:00 UTC is already Q1 2027 in Madrid.
    ['2026-12-31T22:59:59Z', '2026-06-30T00:00:00.000Z'],
    ['2026-12-31T23:00:00Z', '2026-09-30T00:00:00.000Z'],
    ['2027-01-10T09:00:00Z', '2026-09-30T00:00:00.000Z'],
    // Quarter edge in summer time: 30 Sep 22:00 UTC is 1 Oct in Madrid.
    ['2026-09-30T21:59:59Z', '2026-03-31T00:00:00.000Z'],
    ['2026-09-30T22:00:00Z', '2026-06-30T00:00:00.000Z'],
  ])('at %s the window starts at %s', (now, expected) => {
    expect(coverageWindowStart(new Date(now)).toISOString()).toBe(expected);
  });

  it('never excludes a Madrid date inside the previous quarter', () => {
    // Walk every Madrid midnight and noon of two years: whichever quarter
    // `now` falls in, any instant whose Madrid date is inside the previous
    // quarter must be at or after the window start.
    const start = Date.UTC(2025, 0, 1);
    const end = Date.UTC(2027, 0, 1);
    const hour = 3_600_000;
    for (let now = start; now < end; now += 6 * hour) {
      const nowDate = new Date(now);
      const previous = previousQuarter(quarterOf(madridDate(nowDate)));
      const windowStart = coverageWindowStart(nowDate).getTime();
      // The earliest instant of the previous quarter is Madrid midnight on
      // its first day, at most 2 hours before UTC midnight of that day.
      const firstDayUtc = Date.UTC(previous.year, (previous.number - 1) * 3, 1);
      expect(windowStart).toBeLessThanOrEqual(firstDayUtc - 2 * hour);
      // ...and not unreasonably early: Decision 6 sets it one day before.
      expect(windowStart).toBeGreaterThanOrEqual(firstDayUtc - 2 * 24 * hour);
    }
  });
});
