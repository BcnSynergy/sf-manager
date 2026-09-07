import { ApiProperty } from '@nestjs/swagger';
import { ANSWER_VALUES } from '../../domain/answer-value';

// design.md Decision 11: "GET /review-sessions/:sessionId returns entries
// and coverage counts, not the question set" — the frozen question set is
// fetched per element instead (Phase 5).
export class ReviewSessionEntryAnswerDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty({ enum: ANSWER_VALUES })
  answer!: string;
}

// review finding #A (fresh-context review on PR4): ReadReviewSessionResult
// entries (read-review-session.use-case.ts) always carry `answers` — a
// reviewed entry has a non-empty array, an unreviewed one an empty array
// (ElementReviewEntry.reviewed()/.unreviewed(), design.md Decision 1). The
// controller returns that result unchanged, so the field was already part
// of every real response; it just wasn't declared here.
export class ReviewSessionEntryDto {
  @ApiProperty()
  inspectableElementId!: string;

  @ApiProperty()
  reviewed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  observations!: string | null;

  @ApiProperty({ type: ReviewSessionEntryAnswerDto, isArray: true })
  answers!: ReviewSessionEntryAnswerDto[];

  @ApiProperty()
  recordedAt!: Date;
}

export class ReviewSessionCoverageDto {
  @ApiProperty()
  reviewed!: number;

  @ApiProperty()
  unreviewed!: number;
}

export class ReviewSessionDetailResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  templateId!: string;

  @ApiProperty()
  performedById!: string;

  @ApiProperty({ enum: ['draft', 'completed'] })
  status!: string;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: ReviewSessionEntryDto, isArray: true })
  entries!: ReviewSessionEntryDto[];

  @ApiProperty({ type: ReviewSessionCoverageDto })
  coverage!: ReviewSessionCoverageDto;
}
