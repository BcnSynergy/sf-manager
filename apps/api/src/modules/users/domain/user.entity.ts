// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `User` model (design.md Interfaces/Contracts),
// mapped by UserMapper (infrastructure/persistence/user.mapper.ts).
export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
  }

  // ADR-010: a non-null deletedAt marks the row as soft-deleted. The
  // repository's default `deletedAt: null` filter (SoftDeletableRepository)
  // is what actually excludes these rows from lookups — this getter only
  // exposes the same fact on the entity for callers that already have one.
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
