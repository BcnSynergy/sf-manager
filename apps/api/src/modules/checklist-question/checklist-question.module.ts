import { Module } from '@nestjs/common';
import { CHECKLIST_QUESTION_REPOSITORY } from './application/ports/checklist-question.repository.port';
import { DRAFT_SELECTION_CLEANER } from './application/ports/draft-selection-cleaner.port';
import { CreateChecklistQuestionUseCase } from './application/use-cases/create-checklist-question.use-case';
import { ListChecklistQuestionsUseCase } from './application/use-cases/list-checklist-questions.use-case';
import { SoftDeleteChecklistQuestionUseCase } from './application/use-cases/soft-delete-checklist-question.use-case';
import { UpdateChecklistQuestionUseCase } from './application/use-cases/update-checklist-question.use-case';
import { PrismaChecklistQuestionRepository } from './infrastructure/persistence/prisma-checklist-question.repository';
import { PrismaDraftSelectionCleaner } from './infrastructure/persistence/prisma-draft-selection-cleaner';
import { ChecklistQuestionController } from './presentation/checklist-question.controller';

// design.md File Changes (PR 4): registers the admin-only
// /checklist-questions CRUD surface — controller + the 4 use cases built in
// PR 3, mirroring InspectableElementModule. No parent-module import: this
// is a global pool, not community-scoped (unlike InspectableElementModule's
// CommunityModule dependency).
//
// Exports CHECKLIST_QUESTION_REPOSITORY (design.md File Changes) so a
// future `review-template` module (Phase 7+) can inject it directly for
// the draft-selection read path — the same shape as
// InspectableElementModule exporting INSPECTABLE_ELEMENT_REPOSITORY for
// CommunityModule's counter port... except here the direction is the
// OPPOSITE: `review-template` will import THIS module, never the reverse
// (design.md Decision 6).
@Module({
  controllers: [ChecklistQuestionController],
  providers: [
    {
      provide: CHECKLIST_QUESTION_REPOSITORY,
      useClass: PrismaChecklistQuestionRepository,
    },
    // design.md Decision 6: PrismaDraftSelectionCleaner resolves
    // PrismaService via the @Global() PrismaModule directly — no
    // ReviewTemplateModule import, which is what keeps the Nest DI graph
    // acyclic (review-template will import ChecklistQuestionModule, never
    // the reverse).
    {
      provide: DRAFT_SELECTION_CLEANER,
      useClass: PrismaDraftSelectionCleaner,
    },
    CreateChecklistQuestionUseCase,
    ListChecklistQuestionsUseCase,
    UpdateChecklistQuestionUseCase,
    SoftDeleteChecklistQuestionUseCase,
  ],
  exports: [CHECKLIST_QUESTION_REPOSITORY],
})
export class ChecklistQuestionModule {}
