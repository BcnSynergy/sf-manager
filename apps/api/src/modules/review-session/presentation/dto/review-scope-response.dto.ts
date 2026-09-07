import { ApiProperty } from '@nestjs/swagger';

// design.md Data Flow "GET /review-scope": feeds the web open-form's
// community/template pickers, limited to the actor's assigned communities.
export class ReviewScopeCommunityDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ReviewScopeTemplateDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  elementType!: string;

  @ApiProperty()
  frequency!: string;

  @ApiProperty()
  name!: string;
}

export class ReviewScopeResponseDto {
  @ApiProperty({ type: ReviewScopeCommunityDto, isArray: true })
  communities!: ReviewScopeCommunityDto[];

  @ApiProperty({ type: ReviewScopeTemplateDto, isArray: true })
  templates!: ReviewScopeTemplateDto[];
}
