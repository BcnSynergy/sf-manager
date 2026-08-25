// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `CommunityRepresentative` model (design.md
// Decision 3: `deactivatedAt`, not `deletedAt` — domain state ("stopped
// serving"), not an administrative delete, so it must not hide behind
// `SoftDeletableRepository`'s default filter; reactivation overwrites the
// prior timestamp, no assignment history is kept).
export interface CommunityRepresentativeProps {
  id: string;
  communityId: string;
  userId: string;
  deactivatedAt: Date | null;
}

export class CommunityRepresentative {
  readonly id: string;
  readonly communityId: string;
  readonly userId: string;
  readonly deactivatedAt: Date | null;

  constructor(props: CommunityRepresentativeProps) {
    this.id = props.id;
    this.communityId = props.communityId;
    this.userId = props.userId;
    this.deactivatedAt = props.deactivatedAt;
  }

  // NULL deactivatedAt = active (design.md Decision 3). Both the partial
  // unique index backstop and `countActiveByUser` key off this same
  // predicate.
  get isActive(): boolean {
    return this.deactivatedAt === null;
  }
}
