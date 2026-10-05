// Pure calendar helpers for the review schedule (design.md Decisions 3, 5, 6).
// Every judgement uses Europe/Madrid calendar dates, exchanged as
// `YYYY-MM-DD` strings so they can be compared lexicographically and never
// shift with the server's time zone. No I/O, no framework.

export interface Quarter {
  year: number;
  number: 1 | 2 | 3 | 4;
}

const MADRID_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function madridDate(instant: Date): string {
  const parts = MADRID_DATE_FORMAT.formatToParts(instant);
  const part = (type: string): string => {
    const found = parts.find((p) => p.type === type);
    if (found === undefined) {
      throw new Error(`Missing "${type}" in Europe/Madrid date parts`);
    }
    return found.value;
  };
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Expects a Madrid-local `YYYY-MM-DD` string (as `madridDate` returns); the
// input is not validated.
export function quarterOf(date: string): Quarter {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return {
    year,
    number: (Math.floor((month - 1) / 3) + 1) as Quarter['number'],
  };
}

export function previousQuarter(quarter: Quarter): Quarter {
  return quarter.number === 1
    ? { year: quarter.year - 1, number: 4 }
    : { year: quarter.year, number: (quarter.number - 1) as Quarter['number'] };
}

export function quarterEnd(quarter: Quarter): string {
  const month = quarter.number * 3;
  const lastDay = month === 3 || month === 12 ? 31 : 30;
  return `${quarter.year}-${String(month).padStart(2, '0')}-${lastDay}`;
}

// A 29 February anniversary falls on 28 February of the following year.
// Expects a Madrid-local `YYYY-MM-DD` string; the input is not validated.
export function addTwelveMonths(date: string): string {
  const year = Number(date.slice(0, 4)) + 1;
  const monthDay = date.slice(5);
  return `${year}-${monthDay === '02-29' ? '02-28' : monthDay}`;
}

// UTC midnight of the first day of the previous Madrid quarter, minus one
// day. Madrid midnight is at most two hours before UTC midnight, so the
// result is a safe superset that the policy then narrows exactly.
export function coverageWindowStart(now: Date): Date {
  const previous = previousQuarter(quarterOf(madridDate(now)));
  const firstDay = Date.UTC(previous.year, (previous.number - 1) * 3, 1);
  return new Date(firstDay - DAY_MS);
}
