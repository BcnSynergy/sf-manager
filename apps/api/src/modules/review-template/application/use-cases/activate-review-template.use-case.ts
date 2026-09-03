import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import { ReviewTemplateEmptyError } from '../../domain/errors/review-template-empty.error';
import { ReviewTemplateNotFoundError } from '../../domain/errors/review-template-not-found.error';
import {
  ActivationOutcome,
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../ports/review-template.repository.port';

// spec.md "Activation Freezes the Template and Retires Its Predecessor
// Atomically" + design.md Data Flow (POST /review-templates/:id/activate,
// steps 1-4): this use case runs ONLY the pre-flight guards, BEFORE any
// repository write —
//   1. findById ⇒ 404 REVIEW_TEMPLATE_NOT_FOUND
//   2. entity.assertActivatable() [pure domain] ⇒ 409 NOT_EDITABLE
//   3. empty draftQuestionIds ⇒ 409 EMPTY, fast path, before repo.activate()
//   4. one app-generated UUIDv7 row id (ADR-009) per selected question
// Step 5 — the ONE Serializable transaction that assigns the version,
// copies the wording snapshot, retires the predecessor and freezes this
// row — is Phase 9's job inside PrismaReviewTemplateRepository.activate().
// This use case does not implement or simulate that transaction; it only
// calls repo.activate() after every guard above has passed.
@Injectable()
export class ActivateReviewTemplateUseCase {
  constructor(
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(id: string): Promise<ActivationOutcome> {
    const template = await this.templateRepository.findById(id);
    if (!template) {
      throw new ReviewTemplateNotFoundError();
    }

    template.assertActivatable();

    if (template.draftQuestionIds.length === 0) {
      throw new ReviewTemplateEmptyError();
    }

    const rowIds = template.draftQuestionIds.map(() =>
      this.idGenerator.generate(),
    );

    return this.templateRepository.activate(template.id, rowIds);
  }
}
