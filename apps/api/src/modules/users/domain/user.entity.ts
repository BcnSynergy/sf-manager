import { ManagerCapability } from './manager-capability';
import { Role } from './role';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `User` model (design.md Interfaces/Contracts),
// mapped by UserMapper (infrastructure/persistence/user.mapper.ts).
export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // maintenance-company design.md Decision 5: a plain field, deliberately
  // OPTIONAL here (defaults to null) rather than required — every existing
  // caller across the codebase (use cases, seed.ts, fixtures) constructs
  // User without it, and none of those callers are in this PR's scope
  // (Phase 5 is domain+infra only; Phase 6 wires the field into
  // create/update-user use cases). The class field itself is always
  // `string | null`, never `undefined`.
  maintenanceCompanyId?: string | null;
  // review-history-manager-capability/design.md Decision 1: optional here
  // too, defaults to `[]` — mirrors maintenanceCompanyId's precedent above
  // so no existing `new User({…})` call site breaks. The class field is
  // always `ManagerCapability[]`, never `undefined`.
  managerCapabilities?: ManagerCapability[];
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  // NO constructor validation against role (design.md Decision 5, the
  // "single most dangerous shortcut" callout): UserMapper.toDomain
  // reconstitutes every row read from the database, including a
  // grandfathered maintenance-role user with maintenanceCompanyId = null
  // (spec.md "Grandfathered Maintenance-Role Users") — validating here
  // would turn GET /users into a 500 for those rows. The invariant is
  // enforced at the write path only, by
  // maintenance-company-assignment.policy.ts.
  readonly maintenanceCompanyId: string | null;
  // review-history-manager-capability/design.md Decision 1: NO constructor
  // validation, same reasoning as maintenanceCompanyId above — a capability
  // is meaningful only for MANAGER, enforced at the write path only
  // (domain/manager-capability.policy.ts, PR 3), never here.
  readonly managerCapabilities: ManagerCapability[];

  constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.role = props.role;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
    this.maintenanceCompanyId = props.maintenanceCompanyId ?? null;
    // PR 1/4 review fix: `readonly` only blocks rebinding this property, not
    // mutating the array in place — a defensive copy is REQUIRED so a caller
    // mutating its own input array after construction (or PR 2's capability
    // checker reading this value for an authorization decision) can never
    // observe/cause a change that bypassed the write path's policy checks.
    this.managerCapabilities = [...(props.managerCapabilities ?? [])];
  }

  // ADR-010: a non-null deletedAt marks the row as soft-deleted. The
  // repository's default `deletedAt: null` filter (SoftDeletableRepository)
  // is what actually excludes these rows from lookups — this getter only
  // exposes the same fact on the entity for callers that already have one.
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
