import { ApiProperty } from '@nestjs/swagger';

// design.md Decision 11: "GET /review-sessions/:sessionId returns entries
// and coverage counts, not the question set" — the frozen question set is
// fetched per element instead (Phase 5).
export class ReviewSessionEntryDto {
  @ApiProperty()
  inspectableElementId!: string;

  @ApiProperty()
  reviewed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  observations!: string | null;

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
