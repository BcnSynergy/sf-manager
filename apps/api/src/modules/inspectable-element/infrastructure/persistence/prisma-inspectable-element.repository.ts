import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  isUniqueViolationOf,
  UniqueConstraint,
} from '../../../../shared/infrastructure/persistence/prisma-unique-violation';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import { InspectableElementRepository } from '../../application/ports/inspectable-element.repository.port';
import { InspectableElement } from '../../domain/inspectable-element.entity';
import { ElementType } from '../../domain/element-type';
import { ElementCodeAlreadyExistsError } from '../../domain/errors/element-code-already-exists.error';
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

// design.md Decision 3: unique-constraint violation on
// `InspectableElement_code_key`, mapped to ElementCodeAlreadyExistsError so
// the create use case's bounded retry loop can regenerate and retry — never
// surfaces as a raw Prisma error. See isUniqueViolationOf for how the
// driver adapter reports it.
const CODE_UNIQUE_CONSTRAINT: UniqueConstraint = {
  name: 'InspectableElement_code_key',
  columns: ['code'],
};

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

  // design.md Decision 3: `code` is the one unique field on this entity
  // (name/location/serialNumber remain unconstrained) — a P2002 on
  // InspectableElement_code_key maps to ElementCodeAlreadyExistsError,
  // consumed only by the create use case's retry loop.
  async create(element: InspectableElement): Promise<void> {
    try {
      await this.prisma.inspectableElement.create({
        data: InspectableElementMapper.toPersistence(element),
      });
    } catch (error) {
      // Any other P2002, or one whose constraint can't be read, surfaces
      // as the raw Prisma error instead of being mislabeled as a code
      // collision.
      if (isUniqueViolationOf(error, CODE_UNIQUE_CONSTRAINT)) {
        throw new ElementCodeAlreadyExistsError();
      }
      throw error;
    }
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
      deactivatedAt?: Date | null;
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

  // review-session/design.md Decision 6: one query, one `WHERE`, one
  // failing return path — `code` is `@unique` so at most one row can ever
  // match, and communityId/elementType/deletedAt/deactivatedAt are all
  // additional predicates on that same row, not separate lookups. Unknown
  // code, foreign community, wrong element type, decommissioned and
  // soft-deleted all resolve to `null` identically; no branch here can
  // distinguish them.
  async findReviewableByCode(
    communityId: string,
    elementType: ElementType,
    code: string,
  ): Promise<InspectableElement | null> {
    const record = await this.prisma.inspectableElement.findFirst({
      where: {
        code,
        communityId,
        elementType,
        deletedAt: null,
        deactivatedAt: null,
      },
    });

    return record ? InspectableElementMapper.toDomain(record) : null;
  }

  // review-session fresh-context review finding (PR5): mirrors
  // findReviewableByCode's collapsing `WHERE` exactly, keyed by `id`
  // instead of `code` — RecordEntryUseCase's scoping check for the
  // `elementId` URL param on `PUT .../entries/:elementId`.
  async findReviewableById(
    communityId: string,
    elementType: ElementType,
    elementId: string,
  ): Promise<InspectableElement | null> {
    const record = await this.prisma.inspectableElement.findFirst({
      where: {
        id: elementId,
        communityId,
        elementType,
        deletedAt: null,
        deactivatedAt: null,
      },
    });

    return record ? InspectableElementMapper.toDomain(record) : null;
  }

  // review-session/design.md Decision 2 (Phase 6): the required set for
  // completion coverage. Same eligibility predicate as
  // findReviewableByCode/findReviewableById, but returns every matching row.
  async findActiveByCommunityAndType(
    communityId: string,
    elementType: ElementType,
  ): Promise<InspectableElement[]> {
    const records = await this.prisma.inspectableElement.findMany({
      where: {
        communityId,
        elementType,
        deletedAt: null,
        deactivatedAt: null,
      },
    });

    return records.map((record) => InspectableElementMapper.toDomain(record));
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
