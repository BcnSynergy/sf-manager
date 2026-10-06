import { afterEach, describe, expect, it } from 'vitest';
import type {
  ReviewScheduleReasonCode,
  ReviewScheduleRow,
  ReviewScheduleStatus,
} from '../api/review-schedule';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import {
  NEVER_REVIEWED_LABEL_KEY,
  formatCalendarDate,
  mapReasonToText,
  mapStatusToLabelKey,
} from './schedule-labels';

// review-schedule-ui spec: "Raw values never appear" (status and reason map to
// translation keys, never to the enum text) and "Dates do not shift with the
// viewer's time zone" (calendar dates, formatted without any conversion).

function row(overrides: Partial<ReviewScheduleRow>): ReviewScheduleRow {
  return {
    communityId: 'c1',
    communityName: 'Sunset Towers',
    elementType: 'EXTINGUISHER',
    status: 'UPCOMING',
    reasonCode: 'ANNUAL_DUE',
    quarterYear: null,
    quarterNumber: null,
    deadline: '2026-12-31',
    lastCoveringSessionDate: '2026-11-15',
    ...overrides,
  };
}

describe('mapStatusToLabelKey', () => {
  const expected: Record<ReviewScheduleStatus, string> = {
    OVERDUE: 'reviewSchedule.status.overdue',
    NEVER_REVIEWED: 'reviewSchedule.status.neverReviewed',
    UPCOMING: 'reviewSchedule.status.upcoming',
    UP_TO_DATE: 'reviewSchedule.status.upToDate',
  };

  it.each(Object.entries(expected))('maps %s to %s', (status, key) => {
    expect(mapStatusToLabelKey(status as ReviewScheduleStatus)).toBe(key);
  });

  it('never returns the raw enum value', () => {
    for (const status of Object.keys(expected) as ReviewScheduleStatus[]) {
      expect(mapStatusToLabelKey(status)).not.toBe(status);
    }
  });
});

describe('mapReasonToText', () => {
  it('names the missed quarter and the deadline for QUARTER_MISSED', () => {
    const text = mapReasonToText(
      row({
        status: 'OVERDUE',
        reasonCode: 'QUARTER_MISSED',
        quarterYear: 2026,
        quarterNumber: 3,
        deadline: '2026-09-30',
      }),
      'en',
    );

    expect(text).toEqual({
      key: 'reviewSchedule.reason.quarterMissed',
      params: { quarter: 3, year: 2026, deadline: formatCalendarDate('2026-09-30', 'en') },
    });
  });

  it('names the current quarter and the deadline for QUARTER_DUE', () => {
    const text = mapReasonToText(
      row({ reasonCode: 'QUARTER_DUE', quarterYear: 2026, quarterNumber: 4, deadline: '2026-12-31' }),
      'es',
    );

    expect(text).toEqual({
      key: 'reviewSchedule.reason.quarterDue',
      params: { quarter: 4, year: 2026, deadline: formatCalendarDate('2026-12-31', 'es') },
    });
  });

  it.each([
    ['ANNUAL_OVERDUE', 'reviewSchedule.reason.annualOverdue'],
    ['ANNUAL_DUE', 'reviewSchedule.reason.annualDue'],
    ['ANNUAL_NOT_ON_RECORD', 'reviewSchedule.reason.annualNotOnRecord'],
  ] as [ReviewScheduleReasonCode, string][])(
    'maps %s to %s with the formatted deadline only',
    (reasonCode, key) => {
      const text = mapReasonToText(row({ reasonCode, deadline: '2026-12-31' }), 'ca');

      expect(text).toEqual({
        key,
        params: { deadline: formatCalendarDate('2026-12-31', 'ca') },
      });
    },
  );

  it.each(['NEVER_REVIEWED', 'UP_TO_DATE'] as ReviewScheduleReasonCode[])(
    'returns no reason line for %s (no driving obligation)',
    (reasonCode) => {
      expect(
        mapReasonToText(row({ reasonCode, deadline: null, lastCoveringSessionDate: null }), 'en'),
      ).toBeNull();
    },
  );

  it('returns no reason line when a driving code arrives without its deadline', () => {
    expect(mapReasonToText(row({ reasonCode: 'ANNUAL_DUE', deadline: null }), 'en')).toBeNull();
  });

  it('returns no reason line for a quarter code arriving without its quarter', () => {
    expect(
      mapReasonToText(row({ reasonCode: 'QUARTER_DUE', quarterYear: null, quarterNumber: null }), 'en'),
    ).toBeNull();
  });
});

describe('never-reviewed indication and element type', () => {
  it('exposes a translation key, not literal text', () => {
    expect(NEVER_REVIEWED_LABEL_KEY).toBe('reviewSchedule.neverReviewed');
  });

  it('resolves the element type through the existing label map, never the raw enum', () => {
    expect(mapElementTypeToLabelKey('EXTINGUISHER')).toBe('inspectableElement.type.extinguisher');
  });
});

describe('formatCalendarDate', () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  it.each(['en', 'es', 'ca'])('shows 15 Nov 2026 and 31 Dec 2026 as that calendar date in %s', (locale) => {
    expect(formatCalendarDate('2026-11-15', locale)).toMatch(/15/);
    expect(formatCalendarDate('2026-11-15', locale)).toMatch(/2026/);
    expect(formatCalendarDate('2026-12-31', locale)).toMatch(/31/);
    expect(formatCalendarDate('2026-12-31', locale)).toMatch(/2026/);
  });

  it.each(['en', 'es', 'ca'])(
    'is identical under UTC-10 and UTC+12 for every locale (%s)',
    (locale) => {
      const results: Record<string, string[]> = {};
      for (const tz of ['Pacific/Honolulu', 'Pacific/Auckland', 'UTC']) {
        process.env.TZ = tz;
        results[tz] = ['2026-11-15', '2026-12-31', '2026-01-01'].map((d) =>
          formatCalendarDate(d, locale),
        );
      }

      expect(results['Pacific/Honolulu']).toEqual(results['UTC']);
      expect(results['Pacific/Auckland']).toEqual(results['UTC']);
    },
  );

  it('rounds nothing: the day of month is the one in the string', () => {
    process.env.TZ = 'Pacific/Honolulu';
    expect(formatCalendarDate('2026-12-31', 'en')).toContain('31');
    process.env.TZ = 'Pacific/Auckland';
    expect(formatCalendarDate('2026-11-15', 'en')).toContain('15');
  });
});
