import { ApiProperty } from '@nestjs/swagger';
import { ANSWER_VALUES } from '../../domain/answer-value';

// design.md Decision 10: one write endpoint for both outcomes — this DTO
// shape is the same for a reviewed or an unreviewed entry, discriminated
// by `reviewed` alone (spec.md "Record an Element's Answers" /
// "An Unreviewed Element Requires a Recorded Reason").
export class RecordEntryResponseAnswerDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty({ enum: ANSWER_VALUES })
  answer!: string;
}

export class RecordEntryResponseDto {
  @ApiProperty()
  inspectableElementId!: string;

  @ApiProperty()
  reviewed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  observations!: string | null;

  @ApiProperty({ type: RecordEntryResponseAnswerDto, isArray: true })
  answers!: RecordEntryResponseAnswerDto[];

  @ApiProperty()
  recordedAt!: Date;
}
