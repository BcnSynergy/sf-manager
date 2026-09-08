import { ApiProperty } from '@nestjs/swagger';

// review-history design.md Decision 6 — the list row: only fields already
// reachable from the session aggregate plus the resolved community name,
// no coverage counts, no template/element-type column, no performer name
// (see design.md's Open Questions — a `users` read no port supports).
// `performedById` ships as the join key for a future name-resolution
// follow-up, but the UI renders no performer column.
export class ReviewHistoryRowDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  communityName!: string;

  @ApiProperty()
  performedById!: string;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty()
  completedAt!: Date;
}
