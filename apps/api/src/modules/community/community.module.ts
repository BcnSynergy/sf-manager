import { Module } from '@nestjs/common';
import { COMMUNITY_REPOSITORY } from './application/ports/community.repository.port';
import { COMMUNITY_REPRESENTATIVE_REPOSITORY } from './application/ports/community-representative.repository.port';
import { CreateCommunityUseCase } from './application/use-cases/create-community.use-case';
import { ListCommunitiesUseCase } from './application/use-cases/list-communities.use-case';
import { SoftDeleteCommunityUseCase } from './application/use-cases/soft-delete-community.use-case';
import { UpdateCommunityUseCase } from './application/use-cases/update-community.use-case';
import { PrismaCommunityRepository } from './infrastructure/persistence/prisma-community.repository';
import { PrismaCommunityRepresentativeRepository } from './infrastructure/persistence/prisma-community-representative.repository';
import { CommunityController } from './presentation/community.controller';

// design.md File Changes (PR 5): registers the admin-only /communities CRUD
// surface — controller + the 4 use cases built in PR 4, mirroring
// UsersModule.
//
// COMMUNITY_REPRESENTATIVE_REPOSITORY (tasks.md 8.1, pulled forward into PR
// 7): SoftDeleteCommunityUseCase (Phase 7) depends on it directly, so the
// binding MUST exist here for Nest's DI graph to resolve at all — without
// it, `Test.createTestingModule({ imports: [AppModule] }).compile()` throws
// (see app.module.spec.ts). The representative controller/routes
// (tasks.md 8.3) remain a separate PR 8; this module does not yet register
// the add/deactivate/reactivate-representative use cases or their routes.
@Module({
  controllers: [CommunityController],
  providers: [
    { provide: COMMUNITY_REPOSITORY, useClass: PrismaCommunityRepository },
    {
      provide: COMMUNITY_REPRESENTATIVE_REPOSITORY,
      useClass: PrismaCommunityRepresentativeRepository,
    },
    CreateCommunityUseCase,
    ListCommunitiesUseCase,
    UpdateCommunityUseCase,
    SoftDeleteCommunityUseCase,
  ],
  exports: [COMMUNITY_REPOSITORY, COMMUNITY_REPRESENTATIVE_REPOSITORY],
})
export class CommunityModule {}
