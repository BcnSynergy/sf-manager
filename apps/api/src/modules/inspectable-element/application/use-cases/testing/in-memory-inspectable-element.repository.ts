import { InspectableElement } from '../../../domain/inspectable-element.entity';
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
export class InMemoryInspectableElementRepository
  implements InspectableElementRepository
{
  private readonly elementsById = new Map<string, InspectableElement>();

  seed(element: InspectableElement): void {
    this.elementsById.set(element.id, element);
  }

  create(element: InspectableElement): Promise<void> {
    this.elementsById.set(element.id, element);
    return Promise.resolve();
  }

  findByIdInCommunity(
    communityId: string,
    elementId: string,
  ): Promise<InspectableElement | null> {
    const element = this.elementsById.get(elementId);
    if (
      !element ||
      element.communityId !== communityId ||
      element.isDeleted
    ) {
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
}
