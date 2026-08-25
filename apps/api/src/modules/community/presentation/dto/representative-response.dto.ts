import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// design.md "Where the settled policies live in code" (Multi-Community
// Warning) — the only warning code this slice emits.
export class RepresentativeWarningDto {
  @ApiProperty({ enum: ['REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES'] })
  code!: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES';

  @ApiProperty()
  communityCount!: number;
}

// design.md Data Flow (POST /communities/:id/representatives) — response
// body shared by add/reactivate: `AssignmentResponseDto { communityId,
// userId, deactivatedAt: null, warning? }`. Named per-representative here
// because the technician variant (tasks.md 9.6) never carries `warning`.
export class RepresentativeResponseDto {
  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true, type: 'string', format: 'date-time' })
  deactivatedAt!: null;

  @ApiPropertyOptional({ type: RepresentativeWarningDto })
  warning?: RepresentativeWarningDto;
}
