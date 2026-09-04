import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import { InspectableElementRepository } from '../../application/ports/inspectable-element.repository.port';
import { InspectableElement } from '../../domain/inspectable-element.entity';
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
// surfaces as a raw Prisma error.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION &&
        this.isCodeUniqueViolation(error)
      ) {
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

  // Fresh-context review CRITICAL finding (PR3), verified empirically
  // against real Postgres: under Prisma 7 with the @prisma/adapter-pg driver
  // adapter, `error.meta.target` is NEVER populated for P2002s — the
  // violated constraint's columns instead come through under
  // `error.meta.driverAdapterError.cause.constraint.fields` (quoted column
  // names, e.g. `"code"`), because the driver adapter reports the raw
  // Postgres error rather than Prisma's own precomputed `target`. Ported
  // verbatim from PrismaCommunityRepresentativeRepository
  // .extractViolatedConstraintFields, which fixed the same bug for that
  // module — narrowed step-by-step (no `any`) to satisfy
  // `no-unsafe-member-access`.
  private extractViolatedConstraintFields(
    error: unknown,
  ): string[] | undefined {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return undefined;
    }
    const meta: unknown = error.meta;
    if (typeof meta !== 'object' || meta === null) {
      return undefined;
    }
    const driverAdapterError = (meta as Record<string, unknown>)
      .driverAdapterError;
    if (typeof driverAdapterError !== 'object' || driverAdapterError === null) {
      return undefined;
    }
    const cause = (driverAdapterError as Record<string, unknown>).cause;
    if (typeof cause !== 'object' || cause === null) {
      return undefined;
    }
    const constraint = (cause as Record<string, unknown>).constraint;
    if (typeof constraint !== 'object' || constraint === null) {
      return undefined;
    }
    const fields = (constraint as Record<string, unknown>).fields;
    if (!Array.isArray(fields)) {
      return undefined;
    }
    return fields
      .filter((field): field is string => typeof field === 'string')
      .map((field) => field.replace(/"/g, ''));
  }

  // This table has exactly one unique constraint on `code` (design.md
  // Decision 3), so any P2002 whose violated columns include `code` is the
  // code collision — unlike CommunityRepresentativeRepository (2 unique
  // constraints to distinguish), there is no second case to disambiguate
  // here. Falls back to `false` (never throw ElementCodeAlreadyExistsError)
  // when the driver-adapter shape can't be read, letting the raw Prisma
  // error surface instead of mislabeling an unrelated P2002 as a code
  // collision.
  private isCodeUniqueViolation(
    error: Prisma.PrismaClientKnownRequestError,
  ): boolean {
    const fields = this.extractViolatedConstraintFields(error);
    return fields !== undefined && fields.includes('code');
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
