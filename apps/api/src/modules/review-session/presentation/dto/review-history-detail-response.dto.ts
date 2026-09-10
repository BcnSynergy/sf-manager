import { ApiProperty } from '@nestjs/swagger';
import { ReviewSessionEntryAnswerDto } from './review-session-detail-response.dto';

// review-history design.md Decision 6: a SUPERSET of
// ReviewSessionDetailResponseDto — `questions` (frozen wording, via
// findFrozenWithSnapshot) and a nullable `elementCode` per entry (live, via
// findActiveByCommunityAndType) are the only additions. The shipped detail
// DTO deliberately omits both; the history read-back requires them.
export class ReviewHistoryDetailEntryDto {
  @ApiProperty()
  inspectableElementId!: string;

  @ApiProperty({ type: String, nullable: true })
  elementCode!: string | null;

  @ApiProperty()
  reviewed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  observations!: string | null;

  @ApiProperty({ type: ReviewSessionEntryAnswerDto, isArray: true })
  answers!: ReviewSessionEntryAnswerDto[];

  @ApiProperty()
  recordedAt!: Date;
}

export class ReviewHistoryCoverageDto {
  @ApiProperty()
  reviewed!: number;

  @ApiProperty()
  unreviewed!: number;
}

export class ReviewHistoryQuestionDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty()
  text!: string;
}

export class ReviewHistoryDetailResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  templateId!: string;

  @ApiProperty()
  performedById!: string;

  // review-history-company-scope/design.md Decision 8: same resolution and
  // fallback rule as ReviewHistoryRowDto.performedByEmail.
  @ApiProperty()
  performedByEmail!: string;

  @ApiProperty({ enum: ['completed'] })
  status!: string;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ type: Date })
  completedAt!: Date | null;

  @ApiProperty({ type: ReviewHistoryDetailEntryDto, isArray: true })
  entries!: ReviewHistoryDetailEntryDto[];

  @ApiProperty({ type: ReviewHistoryCoverageDto })
  coverage!: ReviewHistoryCoverageDto;

  @ApiProperty({ type: ReviewHistoryQuestionDto, isArray: true })
  questions!: ReviewHistoryQuestionDto[];
}
