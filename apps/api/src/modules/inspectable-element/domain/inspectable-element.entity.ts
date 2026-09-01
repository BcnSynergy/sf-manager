import { ElementType } from './element-type';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `InspectableElement` model (design.md File
// Changes, prisma/schema.prisma). `name`, `location`, `description` and
// `serialNumber` are all plain fields — no Value Objects (design.md
// Decision 2): none carries behaviour beyond validation, and validation
// itself is owned elsewhere — the shared Zod schema (packages/validation,
// Phase 5) trims/normalizes on write. Mirrors MaintenanceCompany/Community/
// User: this constructor performs no validation of its own.
export interface InspectableElementProps {
  id: string;
  communityId: string;
  elementType: ElementType;
  name: string;
  description: string | null;
  location: string;
  installedAt: Date;
  serialNumber: string | null;
  deletedAt: Date | null;
}

export class InspectableElement {
  readonly id: string;
  readonly communityId: string;
  readonly elementType: ElementType;
  readonly name: string;
  readonly description: string | null;
  readonly location: string;
  readonly installedAt: Date;
  readonly serialNumber: string | null;
  readonly deletedAt: Date | null;

  constructor(props: InspectableElementProps) {
    this.id = props.id;
    this.communityId = props.communityId;
    this.elementType = props.elementType;
    this.name = props.name;
    this.description = props.description;
    this.location = props.location;
    this.installedAt = props.installedAt;
    this.serialNumber = props.serialNumber;
    this.deletedAt = props.deletedAt;
  }

  // ADR-010: mirrors MaintenanceCompany.isDeleted / Community.isDeleted /
  // User.isDeleted — the repository's default `deletedAt: null` filter
  // (SoftDeletableRepository) is what actually excludes these rows from
  // lookups; this getter only exposes the same fact on the entity for
  // callers that already have one.
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
