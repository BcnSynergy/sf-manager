import { ApiProperty } from '@nestjs/swagger';

// design.md Data Flow (mirrors POST /communities/:id/representatives) —
// response body shared by add/reactivate. Unlike
// RepresentativeResponseDto, this NEVER carries a `warning` field
// (tasks.md 9.6 — technicians have no multi-community warning).
export class TechnicianResponseDto {
  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true, type: 'string', format: 'date-time' })
  deactivatedAt!: null;
}
