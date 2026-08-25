import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { COMMUNITY_REPOSITORY } from './application/ports/community.repository.port';
import { COMMUNITY_REPRESENTATIVE_REPOSITORY } from './application/ports/community-representative.repository.port';
import { AddRepresentativeUseCase } from './application/use-cases/add-representative.use-case';
import { CreateCommunityUseCase } from './application/use-cases/create-community.use-case';
import { DeactivateRepresentativeUseCase } from './application/use-cases/deactivate-representative.use-case';
import { ListCommunitiesUseCase } from './application/use-cases/list-communities.use-case';
import { ReactivateRepresentativeUseCase } from './application/use-cases/reactivate-representative.use-case';
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
// (see app.module.spec.ts).
//
// UsersModule import (tasks.md 8.3): AddRepresentativeUseCase and
// ReactivateRepresentativeUseCase both inject USER_REPOSITORY (eligibility
// gate + the soft-deleted-user 404, design.md "Where the settled policies
// live in code") — exported by UsersModule the same way AuthModule already
// consumes it for LoginUseCase.
@Module({
  imports: [UsersModule],
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
    AddRepresentativeUseCase,
    DeactivateRepresentativeUseCase,
    ReactivateRepresentativeUseCase,
  ],
  exports: [COMMUNITY_REPOSITORY, COMMUNITY_REPRESENTATIVE_REPOSITORY],
})
export class CommunityModule {}
