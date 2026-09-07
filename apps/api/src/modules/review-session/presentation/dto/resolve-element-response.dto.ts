import { ApiProperty } from '@nestjs/swagger';
import { ANSWER_VALUES } from '../../domain/answer-value';

// design.md Decision 11: GET .../elements/:code returns
// `{ element, questions, entry }` — element identity, the frozen snapshot,
// and any existing entry, in ONE round trip.
export class ResolveElementResponseElementDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  location!: string;
}

export class ResolveElementResponseQuestionDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty()
  text!: string;
}

export class ResolveElementResponseEntryAnswerDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty({ enum: ANSWER_VALUES })
  answer!: string;
}

export class ResolveElementResponseEntryDto {
  @ApiProperty()
  reviewed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  observations!: string | null;

  @ApiProperty({ type: ResolveElementResponseEntryAnswerDto, isArray: true })
  answers!: ResolveElementResponseEntryAnswerDto[];

  @ApiProperty()
  recordedAt!: Date;
}

export class ResolveElementResponseDto {
  @ApiProperty({ type: ResolveElementResponseElementDto })
  element!: ResolveElementResponseElementDto;

  @ApiProperty({ type: ResolveElementResponseQuestionDto, isArray: true })
  questions!: ResolveElementResponseQuestionDto[];

  @ApiProperty({ type: ResolveElementResponseEntryDto, nullable: true })
  entry!: ResolveElementResponseEntryDto | null;
}
