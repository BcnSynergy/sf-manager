import { Inject, Injectable } from '@nestjs/common';
import {
  CHECKLIST_QUESTION_REPOSITORY,
  type ChecklistQuestionRepository,
} from '../../../checklist-question/application/ports/checklist-question.repository.port';
import { ChecklistQuestionNotFoundError } from '../../../checklist-question/domain/errors/checklist-question-not-found.error';
import { ReviewTemplateNotFoundError } from '../../domain/errors/review-template-not-found.error';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../ports/review-template.repository.port';

export interface SetReviewTemplateQuestionsInput {
  templateId: string;
  questionIds: string[];
}

// spec.md "Replace a Draft's Ordered Question Selection": full-replace
// semantics, not merge/append — the submitted order becomes each entry's
// `order`. Every submitted id MUST refer to an existing, non-soft-deleted
// pool question; otherwise 404 CHECKLIST_QUESTION_NOT_FOUND and the
// selection stays unchanged. `assertEditable()` (the entity's own guard,
// design.md Decision 7) rejects a frozen template with 409
// REVIEW_TEMPLATE_NOT_EDITABLE. A cross-frequency pick is explicitly
// ALLOWED — `frequencies` is a suggestion, not a constraint — and there is
// NO elementType guard either: spec.md names no such restriction, so none
// is added here (design.md's own open question on this point is resolved
// in favour of spec.md, which is silent).
@Injectable()
export class SetReviewTemplateQuestionsUseCase {
  constructor(
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(CHECKLIST_QUESTION_REPOSITORY)
    private readonly questionRepository: ChecklistQuestionRepository,
  ) {}

  async execute(input: SetReviewTemplateQuestionsInput): Promise<void> {
    const template = await this.templateRepository.findById(input.templateId);
    if (!template) {
      throw new ReviewTemplateNotFoundError();
    }

    template.assertEditable();

    for (const questionId of input.questionIds) {
      const question = await this.questionRepository.findById(questionId);
      if (!question) {
        throw new ChecklistQuestionNotFoundError();
      }
    }

    await this.templateRepository.replaceDraftQuestions(
      input.templateId,
      input.questionIds,
    );
  }
}
