import { ApiProperty } from '@nestjs/swagger';
import { ELEMENT_TYPES } from '../../../inspectable-element/domain/element-type';
import type { ElementType } from '../../../inspectable-element/domain/element-type';
import type {
  ScheduleReasonCode,
  ScheduleStatus,
} from '../../domain/review-due.policy';

const STATUSES: ScheduleStatus[] = [
  'OVERDUE',
  'NEVER_REVIEWED',
  'UPCOMING',
  'UP_TO_DATE',
];

const REASON_CODES: ScheduleReasonCode[] = [
  'NEVER_REVIEWED',
  'QUARTER_MISSED',
  'QUARTER_DUE',
  'ANNUAL_OVERDUE',
  'ANNUAL_DUE',
  'ANNUAL_NOT_ON_RECORD',
  'UP_TO_DATE',
];

// design.md Decision 9: the flat schedule row. The reason is a code plus
// parameters (quarter year and number, deadline), never English text: the web
// translates it (ADR-007). Every date is a `YYYY-MM-DD` Europe/Madrid calendar
// string, never an instant.
export class ReviewScheduleRowDto {
  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  communityName!: string;

  @ApiProperty({ enum: ELEMENT_TYPES })
  elementType!: ElementType;

  @ApiProperty({ enum: STATUSES })
  status!: ScheduleStatus;

  @ApiProperty({ enum: REASON_CODES })
  reasonCode!: ScheduleReasonCode;

  @ApiProperty({ type: Number, nullable: true })
  quarterYear!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  quarterNumber!: number | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-09-30' })
  deadline!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-05-10' })
  lastCoveringSessionDate!: string | null;
}
