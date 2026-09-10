import { ApiProperty } from '@nestjs/swagger';

// review-history design.md Decision 6 — the list row: only fields already
// reachable from the session aggregate plus the resolved community name,
// no coverage counts, no template/element-type column.
//
// review-history-company-scope/design.md Decision 8: `performedByEmail`
// closes the archived design's own "Performer identity" open question —
// `User` has no name field, so email is the identity this app can show
// today. Resolved once per request via `UserDirectory.findEmailsByIds`;
// unresolvable renders as `''` (localized placeholder on the client).
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
  performedByEmail!: string;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty()
  completedAt!: Date;
}
