import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InspectableElementResponseDto } from './inspectable-element-response.dto';

// design.md Addendum Decision 11: mirrors RepresentativeWarningDto — the
// only warning code this create route emits, informational only.
export class SuppliedCodeWarningDto {
  @ApiProperty({ enum: ['SUPPLIED_CODE_IGNORED'] })
  code!: 'SUPPLIED_CODE_IGNORED';
}

// design.md Addendum Decision 11: create gets its own DTO subclass rather
// than adding `warning?` to the shared InspectableElementResponseDto —
// that DTO is also the list/update response and neither can ever carry a
// warning (mirrors representative-response.dto.ts's per-representative
// warning field precedent).
export class CreateInspectableElementResponseDto extends InspectableElementResponseDto {
  @ApiPropertyOptional({ type: SuppliedCodeWarningDto })
  warning?: SuppliedCodeWarningDto;
}
