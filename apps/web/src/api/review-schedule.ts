import type { ElementType } from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors the status and reason-code vocabularies of apps/api/src/modules/
// review-schedule/domain/review-due.policy.ts (SCHEDULE_STATUSES /
// SCHEDULE_REASON_CODES). The web never recomputes either: it only maps them
// to translation keys (review-schedule-ui spec).
export type ReviewScheduleStatus = 'OVERDUE' | 'NEVER_REVIEWED' | 'UPCOMING' | 'UP_TO_DATE';

export type ReviewScheduleReasonCode =
  | 'NEVER_REVIEWED'
  | 'QUARTER_MISSED'
  | 'QUARTER_DUE'
  | 'ANNUAL_OVERDUE'
  | 'ANNUAL_DUE'
  | 'ANNUAL_NOT_ON_RECORD'
  | 'UP_TO_DATE';

// Mirrors ReviewScheduleRowDto (GET /review-schedule), review-schedule
// design.md Decision 9. `deadline` and `lastCoveringSessionDate` are
// Europe/Madrid calendar dates (`YYYY-MM-DD`), never instants. The quarter
// fields are set for QUARTER_* reason codes only.
export type ReviewScheduleRow = {
  communityId: string;
  communityName: string;
  elementType: ElementType;
  status: ReviewScheduleStatus;
  reasonCode: ReviewScheduleReasonCode;
  quarterYear: number | null;
  quarterNumber: number | null;
  deadline: string | null;
  lastCoveringSessionDate: string | null;
};

export function listReviewSchedule(): Promise<ReviewScheduleRow[]> {
  return apiFetch<ReviewScheduleRow[]>('/review-schedule');
}
