import { Module } from '@nestjs/common';
import { COMMUNITY_REPOSITORY } from './application/ports/community.repository.port';
import { CreateCommunityUseCase } from './application/use-cases/create-community.use-case';
import { ListCommunitiesUseCase } from './application/use-cases/list-communities.use-case';
import { SoftDeleteCommunityUseCase } from './application/use-cases/soft-delete-community.use-case';
import { UpdateCommunityUseCase } from './application/use-cases/update-community.use-case';
import { PrismaCommunityRepository } from './infrastructure/persistence/prisma-community.repository';
import { CommunityController } from './presentation/community.controller';

// design.md File Changes (PR 5): registers the admin-only /communities CRUD
// surface — controller + the 4 use cases built in PR 4, mirroring
// UsersModule. No imports needed yet: this PR's use cases only depend on
// COMMUNITY_REPOSITORY. The representative deactivation cascade (Phase 7)
// will need CommunityRepresentativeRepository from PR 6, at which point this
// module gains a dependency on that provider.
@Module({
  controllers: [CommunityController],
  providers: [
    { provide: COMMUNITY_REPOSITORY, useClass: PrismaCommunityRepository },
    CreateCommunityUseCase,
    ListCommunitiesUseCase,
    UpdateCommunityUseCase,
    SoftDeleteCommunityUseCase,
  ],
  exports: [COMMUNITY_REPOSITORY],
})
export class CommunityModule {}
