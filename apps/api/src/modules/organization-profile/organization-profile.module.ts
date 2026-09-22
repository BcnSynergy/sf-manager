import { Module } from '@nestjs/common';
import { ORGANIZATION_PROFILE_REPOSITORY } from './application/ports/organization-profile.repository.port';
import { GetOrganizationProfileUseCase } from './application/use-cases/get-organization-profile.use-case';
import { UpdateOrganizationProfileUseCase } from './application/use-cases/update-organization-profile.use-case';
import { PrismaOrganizationProfileRepository } from './infrastructure/persistence/prisma-organization-profile.repository';
import { OrganizationProfileController } from './presentation/organization-profile.controller';

// design.md File Changes (PR 3): registers the admin-only
// /organization-profile read/update surface — controller + the 2 use cases
// built in PR 2 + the Prisma adapter built in this PR, mirroring
// MaintenanceCompanyModule/CommunityModule.
//
// Imports nothing (design.md Interfaces): no cross-module dependency, no DI
// cycle risk — unlike MaintenanceCompanyModule, which imports UsersModule
// for its active-users check, this singleton has no such relationship to
// any other module.
@Module({
  controllers: [OrganizationProfileController],
  providers: [
    {
      provide: ORGANIZATION_PROFILE_REPOSITORY,
      useClass: PrismaOrganizationProfileRepository,
    },
    GetOrganizationProfileUseCase,
    UpdateOrganizationProfileUseCase,
  ],
})
export class OrganizationProfileModule {}
