import { Inject, Injectable } from '@nestjs/common';
import { ReviewTemplateNotFoundError } from '../../domain/errors/review-template-not-found.error';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
  type TemplateWithQuestions,
} from '../ports/review-template.repository.port';

// spec.md "List and Read Templates" + "Drafts Track the Live Pool" +
// "Activation Snapshots Each Question's Wording" (design.md Decision 5):
// dispatches on `status` between the two repository read paths — `draft`
// resolves through the LIVE pool (findDraftWithLiveQuestions), `active`/
// `retired` resolve through the persisted snapshot only
// (findFrozenWithSnapshot), which MUST NEVER reference the pool. Enforcing
// this in the query, not a DTO field, is what makes "the frozen path joins
// the pool for convenience" impossible rather than discouraged.
@Injectable()
export class ReadReviewTemplateUseCase {
  constructor(
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
  ) {}

  async execute(id: string): Promise<TemplateWithQuestions> {
    const template = await this.templateRepository.findById(id);
    if (!template) {
      throw new ReviewTemplateNotFoundError();
    }

    const result =
      template.status === 'draft'
        ? await this.templateRepository.findDraftWithLiveQuestions(id)
        : await this.templateRepository.findFrozenWithSnapshot(id);

    if (!result) {
      throw new ReviewTemplateNotFoundError();
    }

    return result;
  }
}
