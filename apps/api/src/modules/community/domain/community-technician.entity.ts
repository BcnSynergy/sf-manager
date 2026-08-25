// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `CommunityTechnician` model (design.md:
// technician sibling of CommunityRepresentative — same shape, but the
// asymmetry is structural: no exclusivity index and no `transactional()`
// on the technician port. Many active technicians per community, and the
// same technician active across many communities, is allowed).
export interface CommunityTechnicianProps {
  id: string;
  communityId: string;
  userId: string;
  deactivatedAt: Date | null;
}

export class CommunityTechnician {
  readonly id: string;
  readonly communityId: string;
  readonly userId: string;
  readonly deactivatedAt: Date | null;

  constructor(props: CommunityTechnicianProps) {
    this.id = props.id;
    this.communityId = props.communityId;
    this.userId = props.userId;
    this.deactivatedAt = props.deactivatedAt;
  }

  // NULL deactivatedAt = active — no exclusivity invariant applies here
  // (design.md Decision 1), unlike CommunityRepresentative.
  get isActive(): boolean {
    return this.deactivatedAt === null;
  }
}
