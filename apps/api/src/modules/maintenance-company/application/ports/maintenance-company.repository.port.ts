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

  // Sets deletedAt (ADR-010) — no row deletion. Callers (design.md Data
  // Flow — DELETE) are responsible for the has-active-users check via
  // UserRepository.countActiveByMaintenanceCompany BEFORE calling this.
  softDeleteById(id: string): Promise<void>;
}

export const MAINTENANCE_COMPANY_REPOSITORY = Symbol(
  'MAINTENANCE_COMPANY_REPOSITORY',
);
