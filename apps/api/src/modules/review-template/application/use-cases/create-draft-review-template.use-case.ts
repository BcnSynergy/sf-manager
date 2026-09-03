import { Inject, Injectable } from '@nestjs/common';
import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import { ReviewTemplateDraftExistsError } from '../../domain/errors/review-template-draft-exists.error';
import { ReviewTemplate } from '../../domain/review-template.entity';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../ports/review-template.repository.port';

export interface CreateDraftReviewTemplateInput {
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
}

export interface CreateDraftReviewTemplateResult {
  id: string;
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
  status: 'draft';
  version: null;
}

// spec.md "Create Draft Template": at most one draft MUST exist per
// (elementType, frequency) lineage at any time — a second create attempt
// is rejected with 409 DRAFT_EXISTS and no row created. An existing
// `active` version does NOT block drafting its successor. The application
// layer's own findAll+filter guard is the primary enforcement here (there
// is no Serializable transaction for draft creation, unlike activation);
// the partial unique index `ReviewTemplate_one_draft_per_lineage`
// (design.md Decision 3) is the by-construction backstop for paths that
// bypass this use case, mapped in Phase 9's adapter.
@Injectable()
export class CreateDraftReviewTemplateUseCase {
  constructor(
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    input: CreateDraftReviewTemplateInput,
  ): Promise<CreateDraftReviewTemplateResult> {
    const existing = await this.templateRepository.findAll();
    const hasDraft = existing.some(
      (template) =>
        template.status === 'draft' &&
        template.elementType === input.elementType &&
        template.frequency === input.frequency,
    );
    if (hasDraft) {
      throw new ReviewTemplateDraftExistsError();
    }

    const template = new ReviewTemplate({
      id: this.idGenerator.generate(),
      elementType: input.elementType,
      frequency: input.frequency,
      name: input.name,
      version: null,
      status: 'draft',
      draftQuestionIds: [],
      createdAt: new Date(),
      deletedAt: null,
    });

    await this.templateRepository.create(template);

    return {
      id: template.id,
      elementType: template.elementType,
      frequency: template.frequency,
      name: template.name,
      status: 'draft',
      version: null,
    };
  }
}
