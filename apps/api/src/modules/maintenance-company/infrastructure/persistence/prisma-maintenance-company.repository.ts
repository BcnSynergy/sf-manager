import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import { MaintenanceCompanyRepository } from '../../application/ports/maintenance-company.repository.port';
import { MaintenanceCompany } from '../../domain/maintenance-company.entity';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import { TaxIdAlreadyInUseError } from '../../domain/errors/tax-id-already-in-use.error';
import { MaintenanceCompanyMapper } from './maintenance-company.mapper';

// design.md Decision 2 Gotcha: MaintenanceCompany has exactly two unique
// constraints — the hand-written partial unique index on taxId and the
// UUIDv7 primary key (ADR-009, not a real failure mode) — so a P2002 is
// mapped UNCONDITIONALLY to TaxIdAlreadyInUseError, mirroring
// PrismaUserRepository.create's identical argument for `email`. Do NOT
// branch on error.meta.target: Prisma cannot reliably report it for a
// hand-written index it has no schema knowledge of.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

// PR8 review: updateById()'s `where` includes the deletedAt: null default
// filter (below), so a concurrent delete landing between
// UpdateMaintenanceCompanyUseCase's findById check and this write makes
// Prisma's update() match zero rows and throw P2025 instead of silently
// writing onto an already-deleted row — mapped to MaintenanceCompanyNotFoundError,
// the same 404 the use case's own findById check would have thrown had it
// run a moment later.
const RECORD_NOT_FOUND = 'P2025';

// Prisma adapter for the MaintenanceCompanyRepository port (ADR-013).
// Extends SoftDeletableRepository so the ADR-010 `deletedAt: null` default
// filter is enforced by construction — mirrors PrismaCommunityRepository. No
// transactional() (design.md Decision 6): this module has no
// multi-statement invariant a single-repository transaction could protect.
@Injectable()
export class PrismaMaintenanceCompanyRepository
  extends SoftDeletableRepository
  implements MaintenanceCompanyRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Default `deletedAt: null` filter (ADR-010) — a soft-deleted company
  // resolves to null, so Update/SoftDelete use cases 404 it the same way as
  // "no such company".
  async findById(id: string): Promise<MaintenanceCompany | null> {
    const record = await this.prisma.maintenanceCompany.findFirst({
      where: this.withDefaultFilter({ id }),
    });

    return record ? MaintenanceCompanyMapper.toDomain(record) : null;
  }

  // Soft-deleted companies are EXCLUDED by default (ADR-010, spec.md "List
  // Maintenance Companies" / "Soft-deleted companies excluded from the
  // list").
  async findAll(): Promise<MaintenanceCompany[]> {
    const records = await this.prisma.maintenanceCompany.findMany({
      where: this.withDefaultFilter({}),
    });

    return records.map((record) => MaintenanceCompanyMapper.toDomain(record));
  }

  // Plain insert (design.md Decision 2) — no read-check. A taxId collision
  // among active rows surfaces as a P2002 from the hand-written partial
  // unique index, mapped below to TaxIdAlreadyInUseError.
  async create(company: MaintenanceCompany): Promise<void> {
    try {
      await this.prisma.maintenanceCompany.create({
        data: MaintenanceCompanyMapper.toPersistence(company),
      });
    } catch (error) {
      throw this.mapTaxIdViolation(error);
    }
  }

  // PR8 review: where includes the deletedAt: null default filter so a
  // concurrent delete landing after UpdateMaintenanceCompanyUseCase's own
  // findById check (but before this write) can't silently write onto the
  // now-deleted row — Prisma matches zero rows and throws P2025, mapped
  // below to MaintenanceCompanyNotFoundError.
  async updateById(
    id: string,
    changes: { name?: string; taxId?: string; contactInfo?: string },
  ): Promise<void> {
    try {
      await this.prisma.maintenanceCompany.update({
        where: this.withDefaultFilter({ id }),
        data: changes,
      });
    } catch (error) {
      throw this.mapMutationError(error);
    }
  }

  // design.md Decision 4 addendum (Phase 8): a single atomic UPDATE with a
  // NOT EXISTS guard against User closes the PR7-documented cross-repository
  // TOCTOU race — the "no active user attached" invariant and the write
  // happen inside one Postgres statement, so there is no window for a
  // concurrent create/update-user call to slip a user in between a
  // check and this write. Returns true iff the row existed, was not already
  // deleted, AND had no active user attached at write time (i.e. the UPDATE
  // actually matched and flipped deletedAt).
  async softDeleteById(id: string): Promise<boolean> {
    const affectedRows = await this.prisma.$executeRaw`
      UPDATE "MaintenanceCompany"
      SET "deletedAt" = now()
      WHERE "id" = ${id}::uuid
        AND "deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "User"
          WHERE "maintenanceCompanyId" = ${id}::uuid
            AND "deletedAt" IS NULL
        )
    `;

    return affectedRows === 1;
  }

  // Shared by updateById() — checks the not-found case first, then falls
  // through to the same taxId-collision mapping create() uses.
  private mapMutationError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === RECORD_NOT_FOUND
    ) {
      return new MaintenanceCompanyNotFoundError();
    }
    return this.mapTaxIdViolation(error);
  }

  private mapTaxIdViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return new TaxIdAlreadyInUseError();
    }
    return error;
  }
}
