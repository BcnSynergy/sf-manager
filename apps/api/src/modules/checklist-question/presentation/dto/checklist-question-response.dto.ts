import { ApiProperty } from '@nestjs/swagger';

// design.md Data Flow: response body shared by create/list/update —
// checklist-question-management spec.md's entity shape is id, elementType,
// frequencies, text (deletedAt is never returned — mirrors
// InspectableElementResponseDto).
export class ChecklistQuestionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  elementType!: string;

  @ApiProperty({ type: [String] })
  frequencies!: string[];

  @ApiProperty()
  text!: string;
}
