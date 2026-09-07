import { InspectableElement } from '../../domain/inspectable-element.entity';
import { ElementType } from '../../domain/element-type';

// Port (application layer, ADR-002/013): the `inspectable-element`
// presentation/infrastructure layers (PR 6) depend on this interface, never
// on the Prisma adapter directly. See design.md Interfaces — the concrete
// adapter is PrismaInspectableElementRepository
// (infrastructure/persistence/prisma-inspectable-element.repository.ts,
// PR 6).
//
// No transactional() — mechanical interface, no multi-statement invariant a
// single-repository transaction could protect (mirrors
// MaintenanceCompanyRepository).
//
// No countActiveByCommunity() here (design.md Decision 4): that method lives
// on community's own InspectableElementCounter port instead. Adding it here
// would force CommunityModule to import InspectableElementModule and close a
// Nest DI cycle.
export interface InspectableElementRepository {
  // Plain insert — nothing about this entity is unique (design.md "No
  // Uniqueness Constraints on Name, Location, or Serial Number").
  create(element: InspectableElement): Promise<void>;

  // Community-scoped by construction (design.md Decision 5): wrong
  // community, unknown id and soft-deleted all resolve to null — one
  // indistinguishable 404. The scope is a property of the port, not a
  // per-caller discipline check.
  findByIdInCommunity(
    communityId: string,
    elementId: string,
  ): Promise<InspectableElement | null>;

  // Default deletedAt: null filter (ADR-010) — soft-deleted elements are
  // EXCLUDED by default (spec.md "Soft-deleted elements excluded from the
  // list").
  findAllByCommunity(communityId: string): Promise<InspectableElement[]>;

  // communityId and elementType are NOT updatable — an element does not
  // move between communities and does not change type in this slice.
  // `null` explicitly clears an optional field; `undefined` leaves it
  // alone. `deactivatedAt` (review-session/design.md Decision 3): `undefined`
  // leaves the state unchanged, `null` reactivates, a `Date` decommissions —
  // no new permission, reuses `inspectableElement:update`.
  updateById(
    elementId: string,
    changes: {
      name?: string;
      description?: string | null;
      location?: string;
      serialNumber?: string | null;
      installedAt?: Date;
      deactivatedAt?: Date | null;
    },
  ): Promise<void>;

  // Sets deletedAt (ADR-010). Plain void — unlike CommunityRepository, no
  // cross-table invariant blocks this write, so there is nothing to make
  // atomic (contrast community's softDeleteById).
  softDeleteById(elementId: string): Promise<void>;

  // review-session/design.md Decision 6: the ONE by-code method, scope in
  // the signature — no `findByCode(code)` is ever added. `communityId` and
  // `elementType` are read off the session the caller already loaded
  // (SessionAccess), never accepted as request parameters, so the caller
  // cannot widen the scope. Unknown code, foreign community, wrong element
  // type, decommissioned (`deactivatedAt` set) and soft-deleted
  // (`deletedAt` set) all collapse to the SAME `null` inside one `WHERE` —
  // there is exactly one failing return path, so the use case cannot
  // distinguish "why" and therefore cannot leak it.
  findReviewableByCode(
    communityId: string,
    elementType: ElementType,
    code: string,
  ): Promise<InspectableElement | null>;
}

export const INSPECTABLE_ELEMENT_REPOSITORY = Symbol(
  'INSPECTABLE_ELEMENT_REPOSITORY',
);
