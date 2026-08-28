import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MAINTENANCE_COMPANY_REPOSITORY } from './application/ports/maintenance-company.repository.port';
import { CreateMaintenanceCompanyUseCase } from './application/use-cases/create-maintenance-company.use-case';
import { ListMaintenanceCompaniesUseCase } from './application/use-cases/list-maintenance-companies.use-case';
import { SoftDeleteMaintenanceCompanyUseCase } from './application/use-cases/soft-delete-maintenance-company.use-case';
import { UpdateMaintenanceCompanyUseCase } from './application/use-cases/update-maintenance-company.use-case';
import { PrismaMaintenanceCompanyRepository } from './infrastructure/persistence/prisma-maintenance-company.repository';
import { MaintenanceCompanyController } from './presentation/maintenance-company.controller';

// design.md File Changes (PR 8): registers the admin-only
// /maintenance-companies CRUD surface — controller + the 4 use cases built
// in PR 7, mirroring CommunityModule/UsersModule.
//
// UsersModule import (design.md Decision 4): SoftDeleteMaintenanceCompany
// UseCase injects USER_REPOSITORY directly (countActiveByMaintenanceCompany)
// — verbatim the CommunityModule precedent. This is the ONLY direction of
// the cross-module dependency: UsersModule imports nothing from this module
// (it owns its own MAINTENANCE_COMPANY_LOOKUP port/adapter instead), which
// is what keeps the Nest DI graph acyclic without forwardRef().
@Module({
  imports: [UsersModule],
  controllers: [MaintenanceCompanyController],
  providers: [
    {
      provide: MAINTENANCE_COMPANY_REPOSITORY,
      useClass: PrismaMaintenanceCompanyRepository,
    },
    CreateMaintenanceCompanyUseCase,
    ListMaintenanceCompaniesUseCase,
    UpdateMaintenanceCompanyUseCase,
    SoftDeleteMaintenanceCompanyUseCase,
  ],
  exports: [MAINTENANCE_COMPANY_REPOSITORY],
})
export class MaintenanceCompanyModule {}
