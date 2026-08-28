import { MaintenanceCompany } from '../../../domain/maintenance-company.entity';
import { TaxIdAlreadyInUseError } from '../../../domain/errors/tax-id-already-in-use.error';
import { MaintenanceCompanyRepository } from '../../ports/maintenance-company.repository.port';

// Test double for MaintenanceCompanyRepository (design.md Testing Strategy:
// in-memory fakes for use-case unit specs, mirroring
// InMemoryCommunityRepository). Shared across the four use-case unit specs
// (tasks.md 7.6).
//
// Unlike InMemoryUserRepository.create() (email uniqueness applies to ANY
// existing row, active or soft-deleted — schema.prisma's plain @unique),
// this fake MUST reproduce the *partial* uniqueness the real partial unique
// index enforces: only ACTIVE (non-soft-deleted) rows collide on `taxId`
// (design.md Decision 2 — "a soft-deleted company frees its taxId for
// reuse"). Getting this wrong would let the fake accept a case the real
// database rejects, or vice versa.
export class InMemoryMaintenanceCompanyRepository implements MaintenanceCompanyRepository {
  private readonly companiesById = new Map<string, MaintenanceCompany>();

  seed(company: MaintenanceCompany): void {
    this.companiesById.set(company.id, company);
  }

  findById(id: string): Promise<MaintenanceCompany | null> {
    const company = this.companiesById.get(id);
    // deletedAt: null default filter parity (ADR-010) — a soft-deleted
    // company resolves to null, same as InMemoryCommunityRepository.findById.
    if (!company || company.isDeleted) {
      return Promise.resolve(null);
    }
    return Promise.resolve(company);
  }

  findAll(): Promise<MaintenanceCompany[]> {
    // Soft-deleted companies excluded from findAll (ADR-010), same filter
    // parity as InMemoryCommunityRepository.findAll.
    return Promise.resolve(
      [...this.companiesById.values()].filter((company) => !company.isDeleted),
    );
  }

  create(company: MaintenanceCompany): Promise<void> {
    if (this.hasActiveTaxIdCollision(company.taxId)) {
      return Promise.reject(new TaxIdAlreadyInUseError());
    }
    this.companiesById.set(company.id, company);
    return Promise.resolve();
  }

  updateById(
    id: string,
    changes: { name?: string; taxId?: string; contactInfo?: string },
  ): Promise<void> {
    const existing = this.companiesById.get(id);
    if (!existing) {
      return Promise.resolve();
    }
    const nextTaxId = changes.taxId ?? existing.taxId;
    if (
      changes.taxId !== undefined &&
      this.hasActiveTaxIdCollision(nextTaxId, id)
    ) {
      return Promise.reject(new TaxIdAlreadyInUseError());
    }
    this.companiesById.set(
      id,
      new MaintenanceCompany({
        ...existing,
        name: changes.name ?? existing.name,
        taxId: nextTaxId,
        contactInfo: changes.contactInfo ?? existing.contactInfo,
      }),
    );
    return Promise.resolve();
  }

  // Partial-uniqueness parity with the real partial unique index (design.md
  // Decision 2): only ACTIVE rows collide on taxId. A soft-deleted row with
  // the same taxId does NOT block create()/updateById(). `excludeId` lets
  // updateById() exclude the row being updated from its own check.
  private hasActiveTaxIdCollision(taxId: string, excludeId?: string): boolean {
    for (const existing of this.companiesById.values()) {
      if (
        existing.id !== excludeId &&
        existing.taxId === taxId &&
        !existing.isDeleted
      ) {
        return true;
      }
    }
    return false;
  }

  softDeleteById(id: string): Promise<void> {
    const existing = this.companiesById.get(id);
    if (!existing) {
      return Promise.resolve();
    }
    this.companiesById.set(
      id,
      new MaintenanceCompany({ ...existing, deletedAt: new Date() }),
    );
    return Promise.resolve();
  }
}
