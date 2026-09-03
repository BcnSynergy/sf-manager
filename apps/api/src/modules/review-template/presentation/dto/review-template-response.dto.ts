import { ApiProperty } from '@nestjs/swagger';
import { ReviewTemplateQuestionResponseDto } from './review-template-question-response.dto';

// design.md Decision 5: ONE response shape for GET .../:id, regardless of
// whether the repository resolved it through the draft (live pool) or
// frozen (persisted snapshot) read path — `status` already discriminates
// which wording source the client is looking at, so no second
// `wordingSource` field is added.
export class ReviewTemplateResponseDto {
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

  @ApiProperty({ type: [ReviewTemplateQuestionResponseDto] })
  questions!: ReviewTemplateQuestionResponseDto[];
}
