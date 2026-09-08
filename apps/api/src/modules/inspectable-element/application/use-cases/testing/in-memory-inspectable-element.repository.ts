import { InspectableElement } from '../../../domain/inspectable-element.entity';
import { ElementType } from '../../../domain/element-type';
import { ElementCodeAlreadyExistsError } from '../../../domain/errors/element-code-already-exists.error';
import { InspectableElementRepository } from '../../ports/inspectable-element.repository.port';

// Test double for InspectableElementRepository (design.md Testing Strategy:
// in-memory fakes for use-case unit specs, mirroring
// InMemoryMaintenanceCompanyRepository). Shared across the four use-case
// unit specs (tasks.md 5.2-5.5).
//
// Reproduces the community scoping design.md Decision 5 requires:
// findByIdInCommunity must resolve to null for a wrong communityId, an
// unknown elementId, AND a soft-deleted element — all three collapse to the
// same indistinguishable 404, exactly like the real
// `WHERE id = ... AND communityId = ... AND deletedAt IS NULL` query.
export class InMemoryInspectableElementRepository implements InspectableElementRepository {
  private readonly elementsById = new Map<string, InspectableElement>();
  // Mirrors the real InspectableElement_code_key unique index — create()
  // throws ElementCodeAlreadyExistsError on a duplicate exactly like the
  // Prisma adapter maps a real P2002 (design.md Decision 3).
  private readonly codesInUse = new Set<string>();

  seed(element: InspectableElement): void {
    this.elementsById.set(element.id, element);
    this.codesInUse.add(element.code);
  }

  create(element: InspectableElement): Promise<void> {
    if (this.codesInUse.has(element.code)) {
      return Promise.reject(new ElementCodeAlreadyExistsError());
    }
    this.elementsById.set(element.id, element);
    this.codesInUse.add(element.code);
    return Promise.resolve();
  }

  findByIdInCommunity(
    communityId: string,
    elementId: string,
  ): Promise<InspectableElement | null> {
    const element = this.elementsById.get(elementId);
    if (!element || element.communityId !== communityId || element.isDeleted) {
      return Promise.resolve(null);
    }
    return Promise.resolve(element);
  }

  findAllByCommunity(communityId: string): Promise<InspectableElement[]> {
    // Soft-deleted elements excluded (ADR-010), same filter parity as every
    // other in-memory fake's findAll.
    return Promise.resolve(
      [...this.elementsById.values()].filter(
        (element) => element.communityId === communityId && !element.isDeleted,
      ),
    );
  }

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
  ): Promise<void> {
    const existing = this.elementsById.get(elementId);
    if (!existing) {
      return Promise.resolve();
    }
    this.elementsById.set(
      elementId,
      new InspectableElement({
        ...existing,
        name: changes.name ?? existing.name,
        description:
          changes.description === undefined
            ? existing.description
            : changes.description,
        location: changes.location ?? existing.location,
        serialNumber:
          changes.serialNumber === undefined
            ? existing.serialNumber
            : changes.serialNumber,
        installedAt: changes.installedAt ?? existing.installedAt,
        deactivatedAt:
          changes.deactivatedAt === undefined
            ? existing.deactivatedAt
            : changes.deactivatedAt,
      }),
    );
    return Promise.resolve();
  }

  softDeleteById(elementId: string): Promise<void> {
    const existing = this.elementsById.get(elementId);
    if (!existing) {
      return Promise.resolve();
    }
    this.elementsById.set(
      elementId,
      new InspectableElement({ ...existing, deletedAt: new Date() }),
    );
    return Promise.resolve();
  }

  // review-session/design.md Decision 6 — mirrors the real adapter's single
  // collapsing `WHERE`: unknown code, foreign community, wrong element
  // type, decommissioned and soft-deleted all resolve to `null` here too.
  findReviewableByCode(
    communityId: string,
    elementType: ElementType,
    code: string,
  ): Promise<InspectableElement | null> {
    const element = [...this.elementsById.values()].find(
      (candidate) => candidate.code === code,
    );
    if (
      !element ||
      element.communityId !== communityId ||
      element.elementType !== elementType ||
      element.isDeleted ||
      element.isDeactivated
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(element);
  }

  // review-session fresh-context review finding (PR5) — mirrors
  // findReviewableByCode's collapsing checks exactly, keyed by id instead
  // of code.
  findReviewableById(
    communityId: string,
    elementType: ElementType,
    elementId: string,
  ): Promise<InspectableElement | null> {
    const element = this.elementsById.get(elementId);
    if (
      !element ||
      element.communityId !== communityId ||
      element.elementType !== elementType ||
      element.isDeleted ||
      element.isDeactivated
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(element);
  }

  // review-session/design.md Decision 2 (Phase 6) — mirrors the real
  // adapter's collapsing filter (deletedAt IS NULL AND deactivatedAt IS
  // NULL), returning every matching row instead of resolving one.
  findActiveByCommunityAndType(
    communityId: string,
    elementType: ElementType,
  ): Promise<InspectableElement[]> {
    return Promise.resolve(
      [...this.elementsById.values()].filter(
        (element) =>
          element.communityId === communityId &&
          element.elementType === elementType &&
          !element.isDeleted &&
          !element.isDeactivated,
      ),
    );
  }
}
