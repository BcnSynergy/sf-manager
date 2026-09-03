import { ApiProperty } from '@nestjs/swagger';

// design.md "List and Read Templates": GET /review-templates returns
// metadata only, across draft/active/retired lineages — no question join
// (design.md Decision 5's two read paths are only exercised by the
// single-template GET .../:id route). Mirrors ListReviewTemplatesUseCase's
// ListedReviewTemplate result shape.
export class ReviewTemplateListItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  elementType!: string;

  @ApiProperty()
  frequency!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: Number, nullable: true })
  version!: number | null;

  @ApiProperty()
  status!: string;
}
