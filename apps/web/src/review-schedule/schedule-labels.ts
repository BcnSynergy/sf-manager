import type {
  ReviewScheduleReasonCode,
  ReviewScheduleRow,
  ReviewScheduleStatus,
} from '../api/review-schedule';

// "Value in, i18n key out" helpers for the review schedule, same shape as
// inspectable-element/element-type-labels.ts. `Record<..., string>` makes a
// new status or reason code a compile error until it is mapped, never a raw
// enum leak (review-schedule-ui spec "Raw values never appear").
const STATUS_LABEL_KEYS: Record<ReviewScheduleStatus, string> = {
  OVERDUE: 'reviewSchedule.status.overdue',
  NEVER_REVIEWED: 'reviewSchedule.status.neverReviewed',
  UPCOMING: 'reviewSchedule.status.upcoming',
  UP_TO_DATE: 'reviewSchedule.status.upToDate',
};

export function mapStatusToLabelKey(status: ReviewScheduleStatus): string {
  return STATUS_LABEL_KEYS[status];
}

// Shown in place of the last-review date when no covering session exists.
export const NEVER_REVIEWED_LABEL_KEY = 'reviewSchedule.neverReviewed';

// Reason codes that carry no driving obligation (null = no reason line).
const REASON_KEYS: Record<ReviewScheduleReasonCode, string | null> = {
  NEVER_REVIEWED: null,
  UP_TO_DATE: null,
  QUARTER_MISSED: 'reviewSchedule.reason.quarterMissed',
  QUARTER_DUE: 'reviewSchedule.reason.quarterDue',
  ANNUAL_OVERDUE: 'reviewSchedule.reason.annualOverdue',
  ANNUAL_DUE: 'reviewSchedule.reason.annualDue',
  ANNUAL_NOT_ON_RECORD: 'reviewSchedule.reason.annualNotOnRecord',
};

const QUARTER_CODES: ReadonlySet<ReviewScheduleReasonCode> = new Set([
  'QUARTER_MISSED',
  'QUARTER_DUE',
]);

export type ReasonText = {
  key: string;
  params: { deadline: string; quarter?: number; year?: number };
};

// Builds the translation key plus interpolation params for a row's one-line
// reason. Returns null when the row has no driving obligation, or when the
// server omitted data the text needs (a malformed row renders no reason line
// rather than a sentence with a hole in it). The deadline is formatted here
// as a calendar date; nothing is recomputed from it.
export function mapReasonToText(row: ReviewScheduleRow, locale: string): ReasonText | null {
  const key = REASON_KEYS[row.reasonCode];
  if (key === null || row.deadline === null) {
    return null;
  }
  const deadline = formatCalendarDate(row.deadline, locale);
  if (!QUARTER_CODES.has(row.reasonCode)) {
    return { key, params: { deadline } };
  }
  if (row.quarterNumber === null || row.quarterYear === null) {
    return null;
  }
  return { key, params: { quarter: row.quarterNumber, year: row.quarterYear, deadline } };
}

// Formats a Europe/Madrid calendar date (`YYYY-MM-DD`) for the viewer's UI
// locale with NO time-zone conversion: the string is read as a UTC midnight
// and formatted with `timeZone: 'UTC'`, so the same day shows for every
// browser time zone (spec "Dates do not shift with the viewer's time zone").
// Never pass an instant here.
export function formatCalendarDate(date: string, locale: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
