// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `MaintenanceCompany` model (design.md File
// Changes), mapped by MaintenanceCompanyMapper (infrastructure/persistence,
// PR 8). `name`, `taxId` and `contactInfo` are all plain fields — no Value
// Objects (design.md Decision 3): none carries behaviour beyond validation,
// and validation itself is owned elsewhere — the shared Zod schema
// (packages/validation) trims/normalizes on write, and taxId uniqueness
// among active companies is enforced solely by the DB partial unique index
// (design.md Decision 2), never re-checked here. Mirrors Community/User:
// this constructor performs no validation of its own.
export interface MaintenanceCompanyProps {
  id: string;
  name: string;
  taxId: string;
  contactInfo: string;
  deletedAt: Date | null;
}

export class MaintenanceCompany {
  readonly id: string;
  readonly name: string;
  readonly taxId: string;
  readonly contactInfo: string;
  readonly deletedAt: Date | null;

  constructor(props: MaintenanceCompanyProps) {
    this.id = props.id;
    this.name = props.name;
    this.taxId = props.taxId;
    this.contactInfo = props.contactInfo;
    this.deletedAt = props.deletedAt;
  }

  // ADR-010: mirrors Community.isDeleted / User.isDeleted — the
  // repository's default `deletedAt: null` filter (SoftDeletableRepository)
  // is what actually excludes these rows from lookups; this getter only
  // exposes the same fact on the entity for callers that already have one.
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
