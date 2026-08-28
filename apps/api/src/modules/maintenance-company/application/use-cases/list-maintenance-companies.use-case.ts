import { Inject, Injectable } from '@nestjs/common';
import {
  MAINTENANCE_COMPANY_REPOSITORY,
  type MaintenanceCompanyRepository,
} from '../ports/maintenance-company.repository.port';

export interface ListedMaintenanceCompany {
  id: string;
  name: string;
  taxId: string;
  contactInfo: string;
}

// design.md Testing Strategy + maintenance-company-management spec.md "List
// Maintenance Companies": findAll() already excludes soft-deleted rows by
// construction (ADR-010) — this use case adds no filtering of its own.
@Injectable()
export class ListMaintenanceCompaniesUseCase {
  constructor(
    @Inject(MAINTENANCE_COMPANY_REPOSITORY)
    private readonly maintenanceCompanyRepository: MaintenanceCompanyRepository,
  ) {}

  async execute(): Promise<ListedMaintenanceCompany[]> {
    const companies = await this.maintenanceCompanyRepository.findAll();
    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      taxId: company.taxId,
      contactInfo: company.contactInfo,
    }));
  }
}
