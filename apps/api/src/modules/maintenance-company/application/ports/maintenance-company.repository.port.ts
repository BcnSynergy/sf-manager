import { MaintenanceCompany } from '../../domain/maintenance-company.entity';

// Port (application layer, ADR-002/013): the `maintenance-company`
// presentation/infrastructure layers (PR 8) depend on this interface, never
// on the Prisma adapter directly. See design.md Interfaces/Contracts — the
// concrete adapter is PrismaMaintenanceCompanyRepository
// (infrastructure/persistence/prisma-maintenance-company.repository.ts, PR 8).
//
// No transactional() — this module has no multi-statement invariant a
// single-repository transaction could protect (design.md Decision 6). No
// findByTaxId() — a read-check-then-insert would be a TOCTOU race; the
// partial unique index is the sole enforcement (design.md Decision 2), and
// create()/updateById() surface a violation as a rejected Promise the
// adapter maps to TaxIdAlreadyInUseError.
export interface MaintenanceCompanyRepository {
  // Default `deletedAt: null` filter (ADR-010) — a soft-deleted company
  // resolves to null, so Update/SoftDelete use cases 404 it the same way as
  // "no such company", never "already deleted".
  findById(id: string): Promise<MaintenanceCompany | null>;

  // Soft-deleted companies are EXCLUDED by default (ADR-010, spec.md "List
  // Maintenance Companies" / "Soft-deleted companies excluded from the
  // list").
  findAll(): Promise<MaintenanceCompany[]>;

  // Plain insert, mirrors CommunityRepository.create() (design.md Interfaces).
  // Rejects on a taxId collision among active rows — the adapter maps the
  // partial unique index's P2002 to TaxIdAlreadyInUseError (design.md
  // Decision 2); this fake/adapter-level contract has no explicit "throws"
  // signature because the port stays framework/error-taxonomy agnostic.
  create(company: MaintenanceCompany): Promise<void>;

  updateById(
    id: string,
    changes: { name?: string; taxId?: string; contactInfo?: string },
  ): Promise<void>;

  // Sets deletedAt (ADR-010) — no row deletion. Resolves the PR7-documented
  // cross-repository TOCTOU race (design.md Decision 4 addendum, Phase 8):
  // the real Prisma adapter enforces "no active user attached" ATOMICALLY as
  // part of this single write (a `NOT EXISTS` guard in the same UPDATE
  // statement), so it is the authoritative guarantee, not
  // SoftDeleteMaintenanceCompanyUseCase's earlier
  // countActiveByMaintenanceCompany/assertNoActiveUsersAttached read — that
  // read stays only for the fast path and an accurate error message. Returns
  // `true` iff this call actually flipped `deletedAt` (the row existed, was
  // not already deleted, AND had no active users attached at write time);
  // `false` otherwise (row missing/already deleted, OR a user was
  // concurrently attached between the use case's read-time check and this
  // write — the caller must re-check and report the precise cause).
  softDeleteById(id: string): Promise<boolean>;
}

export const MAINTENANCE_COMPANY_REPOSITORY = Symbol(
  'MAINTENANCE_COMPANY_REPOSITORY',
);
