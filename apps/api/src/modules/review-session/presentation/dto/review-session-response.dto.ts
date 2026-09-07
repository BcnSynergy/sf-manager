import { ApiProperty } from '@nestjs/swagger';

// spec.md "Open a Review Session Against a Community and a Specific
// Template" — the response shape for POST /review-sessions and each item
// of GET /review-sessions (design.md: no entries/coverage on the list
// shape, mirroring ReviewTemplateListItemResponseDto's precedent).
export class ReviewSessionResponseDto {
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
}
