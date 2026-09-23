import { Module } from '@nestjs/common';
import { ORGANIZATION_PROFILE_READER } from './application/ports/organization-profile.reader.port';
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
//
// review-export/design.md Decision 3, tasks.md 3.3: ORGANIZATION_PROFILE_READER
// is bound with `useExisting: ORGANIZATION_PROFILE_REPOSITORY` — a factory
// ALIAS to the same PrismaOrganizationProfileRepository singleton, never a
// second adapter (see organization-profile.module.spec.ts). ONLY the reader
// is exported: a future consumer (review-session, PR 7) can read the
// profile but can never reach update() — the narrowed exception
// review-document *The Organization Profile Gains One Reader, Not a Wider
// Endpoint* and authorization *The Organization Profile Grants Nothing
// Beyond Itself* both describe.
@Module({
  controllers: [OrganizationProfileController],
  providers: [
    {
      provide: ORGANIZATION_PROFILE_REPOSITORY,
      useClass: PrismaOrganizationProfileRepository,
    },
    {
      provide: ORGANIZATION_PROFILE_READER,
      useExisting: ORGANIZATION_PROFILE_REPOSITORY,
    },
    GetOrganizationProfileUseCase,
    UpdateOrganizationProfileUseCase,
  ],
  exports: [ORGANIZATION_PROFILE_READER],
})
export class OrganizationProfileModule {}
