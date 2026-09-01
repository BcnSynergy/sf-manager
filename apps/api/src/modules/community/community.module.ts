import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { COMMUNITY_REPOSITORY } from './application/ports/community.repository.port';
import { COMMUNITY_REPRESENTATIVE_REPOSITORY } from './application/ports/community-representative.repository.port';
import { COMMUNITY_TECHNICIAN_REPOSITORY } from './application/ports/community-technician.repository.port';
import { INSPECTABLE_ELEMENT_COUNTER } from './application/ports/inspectable-element-counter.port';
import { AddRepresentativeUseCase } from './application/use-cases/add-representative.use-case';
import { AddTechnicianUseCase } from './application/use-cases/add-technician.use-case';
import { CreateCommunityUseCase } from './application/use-cases/create-community.use-case';
import { DeactivateRepresentativeUseCase } from './application/use-cases/deactivate-representative.use-case';
import { DeactivateTechnicianUseCase } from './application/use-cases/deactivate-technician.use-case';
import { ListCommunitiesUseCase } from './application/use-cases/list-communities.use-case';
import { ReactivateRepresentativeUseCase } from './application/use-cases/reactivate-representative.use-case';
import { ReactivateTechnicianUseCase } from './application/use-cases/reactivate-technician.use-case';
import { SoftDeleteCommunityUseCase } from './application/use-cases/soft-delete-community.use-case';
import { UpdateCommunityUseCase } from './application/use-cases/update-community.use-case';
import { PrismaCommunityRepository } from './infrastructure/persistence/prisma-community.repository';
import { PrismaCommunityRepresentativeRepository } from './infrastructure/persistence/prisma-community-representative.repository';
import { PrismaCommunityTechnicianRepository } from './infrastructure/persistence/prisma-community-technician.repository';
import { PrismaInspectableElementCounter } from './infrastructure/persistence/prisma-inspectable-element-counter.repository';
import { CommunityController } from './presentation/community.controller';

// design.md File Changes (PR 5): registers the admin-only /communities CRUD
// surface — controller + the 4 use cases built in PR 4, mirroring
// UsersModule.
//
// COMMUNITY_REPRESENTATIVE_REPOSITORY (tasks.md 8.1, pulled forward into PR
// 7): SoftDeleteCommunityUseCase (Phase 7) depends on it directly, so the
// binding MUST exist here for Nest's DI graph to resolve at all — without
// it, `Test.createTestingModule({ imports: [AppModule] }).compile()` throws
// (see app.module.spec.ts).
//
// UsersModule import (tasks.md 8.3, 9.6): AddRepresentativeUseCase/
// AddTechnicianUseCase and ReactivateRepresentativeUseCase/
// ReactivateTechnicianUseCase all inject USER_REPOSITORY (eligibility gate
// + the soft-deleted-user 404, design.md "Where the settled policies live
// in code") — exported by UsersModule the same way AuthModule already
// consumes it for LoginUseCase.
//
// COMMUNITY_TECHNICIAN_REPOSITORY (tasks.md 9.1/9.5): bound to the Prisma
// adapter, mirroring COMMUNITY_REPRESENTATIVE_REPOSITORY — the technician
// use cases resolve this token the same way, just without transactional().
//
// INSPECTABLE_ELEMENT_COUNTER (inspectable-elements/design.md Decision 4,
// tasks.md 3.11): bound to PrismaInspectableElementCounter, a read-only
// count probe owned entirely by `community` — talks to PrismaService
// (`@Global()` PrismaModule) directly, so no InspectableElementModule
// import is added here, keeping the DI graph acyclic.
@Module({
  imports: [UsersModule],
  controllers: [CommunityController],
  providers: [
    { provide: COMMUNITY_REPOSITORY, useClass: PrismaCommunityRepository },
    {
      provide: COMMUNITY_REPRESENTATIVE_REPOSITORY,
      useClass: PrismaCommunityRepresentativeRepository,
    },
    {
      provide: COMMUNITY_TECHNICIAN_REPOSITORY,
      useClass: PrismaCommunityTechnicianRepository,
    },
    {
      provide: INSPECTABLE_ELEMENT_COUNTER,
      useClass: PrismaInspectableElementCounter,
    },
    CreateCommunityUseCase,
    ListCommunitiesUseCase,
    UpdateCommunityUseCase,
    SoftDeleteCommunityUseCase,
    AddRepresentativeUseCase,
    DeactivateRepresentativeUseCase,
    ReactivateRepresentativeUseCase,
    AddTechnicianUseCase,
    DeactivateTechnicianUseCase,
    ReactivateTechnicianUseCase,
  ],
  exports: [
    COMMUNITY_REPOSITORY,
    COMMUNITY_REPRESENTATIVE_REPOSITORY,
    COMMUNITY_TECHNICIAN_REPOSITORY,
  ],
})
export class CommunityModule {}
