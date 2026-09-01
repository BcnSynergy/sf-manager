import { formatInstalledAt, parseInstalledAt } from './installed-at';

// design.md Decision 3: `installedAt` is a Postgres `DATE`, transported as
// an ISO 'YYYY-MM-DD' string. Both boundary conversions are pinned to UTC
// midnight in one place so no timezone-shift bug (an admin typing a date in
// a non-UTC browser seeing a different date rendered back) can occur.
describe('parseInstalledAt', () => {
  it('parses a YYYY-MM-DD string to a Date at UTC midnight', () => {
    const result = parseInstalledAt('2026-03-15');

    expect(result.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('parses a different date to a different UTC-midnight Date', () => {
    const result = parseInstalledAt('2025-11-01');

    expect(result.toISOString()).toBe('2025-11-01T00:00:00.000Z');
  });
});

describe('formatInstalledAt', () => {
  it('formats a UTC-midnight Date back to its YYYY-MM-DD string', () => {
    const value = new Date('2026-03-15T00:00:00.000Z');

    expect(formatInstalledAt(value)).toBe('2026-03-15');
  });
});

describe('parseInstalledAt / formatInstalledAt round trip', () => {
  it('round-trips a date on the EU spring-forward DST boundary (2026-03-29)', () => {
    const iso = '2026-03-29';

    expect(formatInstalledAt(parseInstalledAt(iso))).toBe(iso);
  });

  it('round-trips a date on the EU autumn-back DST boundary (2026-10-25)', () => {
    const iso = '2026-10-25';

    expect(formatInstalledAt(parseInstalledAt(iso))).toBe(iso);
  });

  it('round-trips a UTC-offset-sensitive date at the very start of the year (2026-01-01)', () => {
    const iso = '2026-01-01';

    expect(formatInstalledAt(parseInstalledAt(iso))).toBe(iso);
  });

  it('round-trips a UTC-offset-sensitive date at the very end of the year (2026-12-31)', () => {
    const iso = '2026-12-31';

    expect(formatInstalledAt(parseInstalledAt(iso))).toBe(iso);
  });
});
