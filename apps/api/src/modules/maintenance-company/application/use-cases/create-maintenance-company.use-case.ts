import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import { MaintenanceCompany } from '../../domain/maintenance-company.entity';
import {
  MAINTENANCE_COMPANY_REPOSITORY,
  type MaintenanceCompanyRepository,
} from '../ports/maintenance-company.repository.port';

export interface CreateMaintenanceCompanyInput {
  name: string;
  taxId: string;
  contactInfo: string;
}

export interface CreateMaintenanceCompanyResult {
  id: string;
  name: string;
  taxId: string;
  contactInfo: string;
}

// design.md File Changes + Data Flow — POST /maintenance-companies +
// maintenance-company-management spec.md "Create Maintenance Company":
// IdGenerator.generate() -> MaintenanceCompanyRepository.create(). deletedAt
// always initializes to null. taxId uniqueness among active companies is
// enforced entirely by the partial unique index (design.md Decision 2) — no
// read-check here; a collision surfaces as a rejected create() the adapter
// maps to TaxIdAlreadyInUseError.
@Injectable()
export class CreateMaintenanceCompanyUseCase {
  constructor(
    @Inject(MAINTENANCE_COMPANY_REPOSITORY)
    private readonly maintenanceCompanyRepository: MaintenanceCompanyRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    input: CreateMaintenanceCompanyInput,
  ): Promise<CreateMaintenanceCompanyResult> {
    const company = new MaintenanceCompany({
      id: this.idGenerator.generate(),
      name: input.name,
      taxId: input.taxId,
      contactInfo: input.contactInfo,
      deletedAt: null,
    });

    await this.maintenanceCompanyRepository.create(company);

    return {
      id: company.id,
      name: company.name,
      taxId: company.taxId,
      contactInfo: company.contactInfo,
    };
  }
}
