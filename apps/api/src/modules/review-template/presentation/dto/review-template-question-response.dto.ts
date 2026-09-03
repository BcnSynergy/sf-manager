import { ApiProperty } from '@nestjs/swagger';

// One entry of GET .../:id's `questions` array (design.md Decision 5 — one
// response shape, regardless of which repository read path resolved it).
export class ReviewTemplateQuestionResponseDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty()
  text!: string;
}
