import { ApiProperty } from '@nestjs/swagger';
import type { ElementType } from '../../../inspectable-element/domain/element-type';
import type { ReviewFrequency } from '../../../checklist-question/domain/review-frequency';
import { ReviewSessionEntryAnswerDto } from './review-session-detail-response.dto';
import { ReviewHistoryQuestionDto } from './review-history-detail-response.dto';

// design.md Interfaces/Contracts: the document's OWN entry, template and
// letterhead DTOs — never `ReviewHistoryDetailEntryDto` (Decision 2). It
// reuses only the unchanged `ReviewSessionEntryAnswerDto` and
// `ReviewHistoryQuestionDto`, which stay part of the (untouched) history
// contract. No `coverage`: the document page does not need it.
export class ReviewDocumentEntryDto {
  @ApiProperty()
  inspectableElementId!: string;

  @ApiProperty({ type: String, nullable: true })
  elementCode!: string | null;

  // spec.md "A decommissioned or soft-deleted element still labels its
  // entry" / "An element id with no row falls back to the neutral label":
  // `null` only when the id resolves no row at all — the web renders the
  // neutral label in that case (review-document-ui, PR 12).
  @ApiProperty({ type: String, nullable: true })
  elementName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  elementLocation!: string | null;

  @ApiProperty()
  reviewed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  observations!: string | null;

  @ApiProperty({ type: ReviewSessionEntryAnswerDto, isArray: true })
  answers!: ReviewSessionEntryAnswerDto[];

  @ApiProperty()
  recordedAt!: Date;
}

export class ReviewDocumentTemplateDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['EXTINGUISHER'] })
  elementType!: ElementType;

  @ApiProperty({ enum: ['MONTHLY', 'QUARTERLY', 'YEARLY'] })
  frequency!: ReviewFrequency;

  @ApiProperty({ type: Number, nullable: true })
  version!: number | null;
}

// spec.md "The document exposes only the letterhead fields" — exactly the
// six text fields, never `id`/`logoAssetId`.
export class ReviewDocumentLetterheadDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  legalName!: string;

  @ApiProperty()
  taxId!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  email!: string;
}

export class ReviewDocumentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  communityName!: string;

  @ApiProperty({ type: ReviewDocumentTemplateDto })
  template!: ReviewDocumentTemplateDto;

  // spec.md "A session without an attributed company has no company":
  // `null` = no company recorded, never `''`.
  @ApiProperty({ type: String, nullable: true })
  maintenanceCompanyName!: string | null;

  @ApiProperty()
  performedById!: string;

  @ApiProperty()
  performedByEmail!: string;

  @ApiProperty({ enum: ['completed'] })
  status!: string;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: ReviewDocumentEntryDto, isArray: true })
  entries!: ReviewDocumentEntryDto[];

  @ApiProperty({ type: ReviewHistoryQuestionDto, isArray: true })
  questions!: ReviewHistoryQuestionDto[];

  @ApiProperty({ type: ReviewDocumentLetterheadDto })
  letterhead!: ReviewDocumentLetterheadDto;
}
