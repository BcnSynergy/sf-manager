import { ApiProperty } from '@nestjs/swagger';

// design.md Data Flow (mirrors GET /communities/:id/representatives) — list
// variant of TechnicianResponseDto: same shape as
// RepresentativeListItemDto, minus any warning field (technicians never
// carry one, tasks.md 9.6). `deactivatedAt` can be a real timestamp here
// since the list route returns BOTH active and deactivated records
// (tasks.md 10.1/10.2).
export class TechnicianListItemDto {
  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true, type: 'string', format: 'date-time' })
  deactivatedAt!: Date | null;
}
