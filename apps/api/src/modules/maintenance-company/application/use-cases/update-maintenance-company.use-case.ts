import { Inject, Injectable } from '@nestjs/common';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import {
  MAINTENANCE_COMPANY_REPOSITORY,
  type MaintenanceCompanyRepository,
} from '../ports/maintenance-company.repository.port';

export interface UpdateMaintenanceCompanyInput {
  id: string;
  name?: string;
  taxId?: string;
  contactInfo?: string;
}

export interface UpdateMaintenanceCompanyResult {
  id: string;
  name: string;
  taxId: string;
  contactInfo: string;
}

// design.md File Changes + maintenance-company-management spec.md "Update
// Maintenance Company" / "Update targets a non-existent company": same
// default deletedAt: null filter as findAll — a non-existent or soft-deleted
// id both 404 identically. taxId uniqueness among active companies is
// enforced entirely by the partial unique index (design.md Decision 2) — no
// read-check here; a collision surfaces as a rejected updateById() the
// adapter maps to TaxIdAlreadyInUseError.
@Injectable()
export class UpdateMaintenanceCompanyUseCase {
  constructor(
    @Inject(MAINTENANCE_COMPANY_REPOSITORY)
    private readonly maintenanceCompanyRepository: MaintenanceCompanyRepository,
  ) {}

  async execute(
    input: UpdateMaintenanceCompanyInput,
  ): Promise<UpdateMaintenanceCompanyResult> {
    const { id, ...changes } = input;

    const existing = await this.maintenanceCompanyRepository.findById(id);
    if (!existing) {
      throw new MaintenanceCompanyNotFoundError();
    }

    await this.maintenanceCompanyRepository.updateById(id, changes);

    return {
      id: existing.id,
      name: changes.name ?? existing.name,
      taxId: changes.taxId ?? existing.taxId,
      contactInfo: changes.contactInfo ?? existing.contactInfo,
    };
  }
}
