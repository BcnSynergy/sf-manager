import { ApiProperty } from '@nestjs/swagger';

// spec.md "Activation Freezes the Template...": "the response MUST be 2xx,
// its `status` MUST be `active`, and its `version` MUST be" the assigned
// number — the ActivationOutcome shape (application/ports/
// review-template.repository.port.ts) already carries exactly these three
// fields, so this DTO mirrors it 1:1 rather than composing a second read
// call for a fuller shape no scenario asks for (ADR-006 — build only what
// the current slice's scenarios require).
export class ActivateReviewTemplateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  version!: number;
}
