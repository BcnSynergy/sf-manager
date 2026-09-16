import { ApiProperty } from '@nestjs/swagger';

// review-history-per-element/design.md Decision 5/File Changes: the
// element-keyed history response. Header carries every field
// findByIdInCommunity's InspectableElement already returns (OQ4) plus a
// resolved communityName (ONE CommunityRepository.findById call, ''
// fallback — same batched-then-placeholder treatment ListReviewHistoryUseCase
// already applies). Rows carry no answers (proposal non-goal) — Swagger
// annotations mirror ReviewHistoryDetailResponseDto's own shape.
export class ElementReviewHistoryHeaderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  elementType!: string;

  @ApiProperty()
  location!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  communityName!: string;

  @ApiProperty({ type: Date, nullable: true })
  deactivatedAt!: Date | null;
}

export class ElementReviewHistoryRowDto {
  @ApiProperty()
  reviewSessionId!: string;

  @ApiProperty()
  performedById!: string;

  @ApiProperty()
  performedByEmail!: string;

  @ApiProperty()
  reviewed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  observations!: string | null;

  @ApiProperty()
  recordedAt!: Date;
}

export class ElementReviewHistoryResponseDto {
  @ApiProperty({ type: ElementReviewHistoryHeaderDto })
  element!: ElementReviewHistoryHeaderDto;

  @ApiProperty({ type: ElementReviewHistoryRowDto, isArray: true })
  entries!: ElementReviewHistoryRowDto[];
}
