import { InspectableElement } from '../../domain/inspectable-element.entity';

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
  // alone.
  updateById(
    elementId: string,
    changes: {
      name?: string;
      description?: string | null;
      location?: string;
      serialNumber?: string | null;
      installedAt?: Date;
    },
  ): Promise<void>;

  // Sets deletedAt (ADR-010). Plain void — unlike CommunityRepository, no
  // cross-table invariant blocks this write, so there is nothing to make
  // atomic (contrast community's softDeleteById).
  softDeleteById(elementId: string): Promise<void>;
}

export const INSPECTABLE_ELEMENT_REPOSITORY = Symbol(
  'INSPECTABLE_ELEMENT_REPOSITORY',
);
