// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `OrganizationProfile` model (design.md File
// Changes), mapped by OrganizationProfileMapper (infrastructure/persistence,
// PR 3). All six text fields are plain fields — no Value Objects (design.md
// Decision 2): none carries behaviour beyond validation, and validation
// itself is owned elsewhere — the shared Zod schema (packages/validation)
// trims/checks-format on write. Mirrors MaintenanceCompany/Community/User:
// this constructor performs no validation of its own.
//
// No `deletedAt` (ADR-010, ADR-012, spec.md "The Profile Has No Create and
// No Delete Surface") — the row representing the company running this very
// instance is not a deletable record.
//
// No `singleton`: the sentinel guard column is persistence-only (design.md
// Decision 1) and is never mapped onto this entity.
//
// No `isComplete()`: the incompleteness signal is UI-only, derived from the
// last-saved snapshot on the page, never from the domain (design.md
// Decision 5).
export interface OrganizationProfileProps {
  id: string;
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  logoAssetId: string | null; // reserved, inert this slice (ADR-012)
}

export class OrganizationProfile {
  readonly id: string;
  readonly name: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly address: string;
  readonly phone: string;
  readonly email: string;
  readonly logoAssetId: string | null;

  constructor(props: OrganizationProfileProps) {
    this.id = props.id;
    this.name = props.name;
    this.legalName = props.legalName;
    this.taxId = props.taxId;
    this.address = props.address;
    this.phone = props.phone;
    this.email = props.email;
    this.logoAssetId = props.logoAssetId;
  }
}
