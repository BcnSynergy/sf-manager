import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/community.module';
import { ELEMENT_CODE_GENERATOR } from './application/ports/element-code-generator.port';
import { INSPECTABLE_ELEMENT_REPOSITORY } from './application/ports/inspectable-element.repository.port';
import { CreateInspectableElementUseCase } from './application/use-cases/create-inspectable-element.use-case';
import { ListInspectableElementsByCommunityUseCase } from './application/use-cases/list-inspectable-elements-by-community.use-case';
import { SoftDeleteInspectableElementUseCase } from './application/use-cases/soft-delete-inspectable-element.use-case';
import { UpdateInspectableElementUseCase } from './application/use-cases/update-inspectable-element.use-case';
import { RandomElementCodeGenerator } from './infrastructure/code/random-element-code.generator';
import { PrismaInspectableElementRepository } from './infrastructure/persistence/prisma-inspectable-element.repository';
import { InspectableElementController } from './presentation/inspectable-element.controller';

// design.md File Changes (PR 6): registers the admin-only
// /communities/:communityId/inspectable-elements CRUD surface — controller +
// the 4 use cases built in PR 5, mirroring MaintenanceCompanyModule.
//
// CommunityModule import (design.md Decision 4): all 4 use cases inject
// COMMUNITY_REPOSITORY directly for the parent-existence guard — the
// already-exported token, reused as-is (proposal choice 2). This is the
// ONLY direction of the cross-module dependency: CommunityModule imports
// nothing from this module (it owns its own INSPECTABLE_ELEMENT_COUNTER
// port/adapter instead, Phase 3), which is what keeps the Nest DI graph
// acyclic without forwardRef().
@Module({
  imports: [CommunityModule],
  controllers: [InspectableElementController],
  providers: [
    {
      provide: INSPECTABLE_ELEMENT_REPOSITORY,
      useClass: PrismaInspectableElementRepository,
    },
    {
      provide: ELEMENT_CODE_GENERATOR,
      useClass: RandomElementCodeGenerator,
    },
    CreateInspectableElementUseCase,
    ListInspectableElementsByCommunityUseCase,
    UpdateInspectableElementUseCase,
    SoftDeleteInspectableElementUseCase,
  ],
  exports: [INSPECTABLE_ELEMENT_REPOSITORY],
})
export class InspectableElementModule {}
