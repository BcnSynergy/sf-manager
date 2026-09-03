import { Inject, Injectable } from '@nestjs/common';
import { ReviewTemplateNotFoundError } from '../../domain/errors/review-template-not-found.error';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../ports/review-template.repository.port';

// spec.md "Only Drafts May Be Soft-Deleted": only a `draft` is soft-
// deletable — frozen (`active`/`retired`) templates reject with 409
// REVIEW_TEMPLATE_NOT_EDITABLE and stay fully visible as historical
// records (ADR-010). `assertEditable()` is the entity's own guard
// (design.md Decision 7), not reimplemented here. `findById` first (404 for
// unknown OR already-deleted id, ADR-010) then softDeleteDraftById, which
// returns whether the row was actually transitioned — mirrors
// SoftDeleteChecklistQuestionUseCase's race-guard shape.
@Injectable()
export class SoftDeleteDraftReviewTemplateUseCase {
  constructor(
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.templateRepository.findById(id);
    if (!existing) {
      throw new ReviewTemplateNotFoundError();
    }

    existing.assertEditable();

    const wasDeleted = await this.templateRepository.softDeleteDraftById(id);
    if (!wasDeleted) {
      // Extremely rare: concurrently transitioned between the read above and
      // this write. findById is the sole existence oracle (ADR-010), so
      // this collapses to the same 404 as the initial check.
      throw new ReviewTemplateNotFoundError();
    }
  }
}
