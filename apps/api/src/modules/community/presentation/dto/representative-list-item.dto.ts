import { ApiProperty } from '@nestjs/swagger';

// design.md Data Flow (GET /communities/:id/representatives) — list variant
// of RepresentativeResponseDto: same caller-facing identity (communityId,
// userId), but `deactivatedAt` can be a real timestamp here (unlike the
// add/reactivate result, which is always freshly-activated `null`), since
// the list route returns BOTH active and deactivated records (tasks.md
// 10.1/10.2, community-assignments spec.md "List Community Assignments").
// Never exposes the surrogate `id` — design.md Decision 4: "the surrogate
// id never leaves the adapter". No `warning` field: that is only computed
// by activation, never by listing.
export class RepresentativeListItemDto {
  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true, type: 'string', format: 'date-time' })
  deactivatedAt!: Date | null;
}
