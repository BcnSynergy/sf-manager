import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import { InspectableElementRepository } from '../../application/ports/inspectable-element.repository.port';
import { InspectableElement } from '../../domain/inspectable-element.entity';
import { InspectableElementNotFoundError } from '../../domain/errors/inspectable-element-not-found.error';
import { InspectableElementMapper } from './inspectable-element.mapper';

// PR6 review (mirrors maintenance-company's PR8 review finding): updateById()
// and softDeleteById()'s `where` includes the deletedAt: null default filter,
// so a concurrent delete landing between the use case's own
// findByIdInCommunity check and this write makes Prisma's update() match zero
// rows and throw P2025 instead of silently writing onto an already-deleted
// row — mapped below to InspectableElementNotFoundError, the same 404 the use
// case's own check would have thrown had it run a moment later.
const RECORD_NOT_FOUND = 'P2025';

// Prisma adapter for the InspectableElementRepository port (ADR-013).
// Extends SoftDeletableRepository so the ADR-010 `deletedAt: null` default
// filter is enforced by construction — mirrors
// PrismaMaintenanceCompanyRepository/PrismaCommunityRepository. No
// transactional() (design.md Interfaces): this module has no
// multi-statement invariant a single-repository transaction could protect.
@Injectable()
export class PrismaInspectableElementRepository
  extends SoftDeletableRepository
  implements InspectableElementRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Plain insert — nothing about this entity is unique (design.md "No
  // Uniqueness Constraints on Name, Location, or Serial Number").
  async create(element: InspectableElement): Promise<void> {
    await this.prisma.inspectableElement.create({
      data: InspectableElementMapper.toPersistence(element),
    });
  }

  // design.md Decision 5: the scope is a property of the port, not a
  // per-caller discipline check — `communityId` is part of the `where`
  // clause alongside the default `deletedAt: null` filter, so
  // wrong-community, unknown id and soft-deleted all collapse to `null`.
  async findByIdInCommunity(
    communityId: string,
    elementId: string,
  ): Promise<InspectableElement | null> {
    const record = await this.prisma.inspectableElement.findFirst({
      where: this.withDefaultFilter({ id: elementId, communityId }),
    });

    return record ? InspectableElementMapper.toDomain(record) : null;
  }

  // Default `deletedAt: null` filter (ADR-010) — soft-deleted elements are
  // EXCLUDED by default (spec.md "Soft-deleted elements excluded from the
  // list").
  async findAllByCommunity(communityId: string): Promise<InspectableElement[]> {
    const records = await this.prisma.inspectableElement.findMany({
      where: this.withDefaultFilter({ communityId }),
    });

    return records.map((record) => InspectableElementMapper.toDomain(record));
  }

  // communityId and elementType are never part of `changes` (design.md
  // Interfaces) — the use case's typed input already excludes them, this
  // adapter has no additional guard to apply.
  async updateById(
    elementId: string,
    changes: {
      name?: string;
      description?: string | null;
      location?: string;
      serialNumber?: string | null;
      installedAt?: Date;
    },
  ): Promise<void> {
    try {
      await this.prisma.inspectableElement.update({
        where: this.withDefaultFilter({ id: elementId }),
        data: changes,
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  // Sets deletedAt (ADR-010). Plain write — unlike CommunityRepository, no
  // cross-table invariant blocks this write, so there is nothing to make
  // atomic (design.md Interfaces).
  async softDeleteById(elementId: string): Promise<void> {
    try {
      await this.prisma.inspectableElement.update({
        where: this.withDefaultFilter({ id: elementId }),
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  private mapMutationError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return new InspectableElementNotFoundError();
    }
    return error;
  }
}
