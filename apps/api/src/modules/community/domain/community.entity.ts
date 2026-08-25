// Hand-written closed-set type (ADR-007), not the Prisma-generated
// `$Enums.Locale`. Kept as a plain field (design.md Decision 5: `locale`
// has no behaviour beyond validation, so it stays a primitive — same
// precedent as `email` on `User`, not a Value Object).
export type Locale = 'en' | 'es' | 'ca';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `Community` model (design.md File Changes),
// mapped by CommunityMapper (infrastructure/persistence, PR 5).
export interface CommunityProps {
  id: string;
  name: string;
  address: string;
  locale: Locale;
  deletedAt: Date | null;
}

export class Community {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly locale: Locale;
  readonly deletedAt: Date | null;

  constructor(props: CommunityProps) {
    this.id = props.id;
    this.name = props.name;
    this.address = props.address;
    this.locale = props.locale;
    this.deletedAt = props.deletedAt;
  }

  // ADR-010: mirrors User.isDeleted — the repository's default
  // `deletedAt: null` filter (SoftDeletableRepository) is what actually
  // excludes these rows from lookups; this getter only exposes the same
  // fact on the entity for callers that already have one.
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
