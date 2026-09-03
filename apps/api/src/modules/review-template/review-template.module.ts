import { Module } from '@nestjs/common';
import { ChecklistQuestionModule } from '../checklist-question/checklist-question.module';
import { ActivateReviewTemplateUseCase } from './application/use-cases/activate-review-template.use-case';
import { CreateDraftReviewTemplateUseCase } from './application/use-cases/create-draft-review-template.use-case';
import { ListReviewTemplatesUseCase } from './application/use-cases/list-review-templates.use-case';
import { ReadReviewTemplateUseCase } from './application/use-cases/read-review-template.use-case';
import { SetReviewTemplateQuestionsUseCase } from './application/use-cases/set-review-template-questions.use-case';
import { SoftDeleteDraftReviewTemplateUseCase } from './application/use-cases/soft-delete-draft-review-template.use-case';
import { REVIEW_TEMPLATE_REPOSITORY } from './application/ports/review-template.repository.port';
import { PrismaReviewTemplateRepository } from './infrastructure/persistence/prisma-review-template.repository';
import { ReviewTemplateController } from './presentation/review-template.controller';

// design.md File Changes (PR 9): registers the admin-only
// /review-templates CRUD + activation surface — controller + the 6 use
// cases built in PR 8, mirroring ChecklistQuestionModule.
//
// Imports ChecklistQuestionModule (not the reverse — design.md Decision 6)
// for CHECKLIST_QUESTION_REPOSITORY, needed by
// SetReviewTemplateQuestionsUseCase's per-id existence validation on
// `PUT .../questions`. ID_GENERATOR is @Global() (IdGeneratorModule,
// app.module.ts) — no explicit import needed here for
// ActivateReviewTemplateUseCase's row-id generation.
@Module({
  imports: [ChecklistQuestionModule],
  controllers: [ReviewTemplateController],
  providers: [
    {
      provide: REVIEW_TEMPLATE_REPOSITORY,
      useClass: PrismaReviewTemplateRepository,
    },
    CreateDraftReviewTemplateUseCase,
    ListReviewTemplatesUseCase,
    ReadReviewTemplateUseCase,
    SetReviewTemplateQuestionsUseCase,
    ActivateReviewTemplateUseCase,
    SoftDeleteDraftReviewTemplateUseCase,
  ],
})
export class ReviewTemplateModule {}
