import { Inject, Injectable } from '@nestjs/common';
import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import { ReviewTemplateStatus } from '../../domain/review-template-status';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../ports/review-template.repository.port';

export interface ListedReviewTemplate {
  id: string;
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
  version: number | null;
  status: ReviewTemplateStatus;
}

// spec.md "List and Read Templates": lists all non-soft-deleted templates
// with elementType, frequency, name, version and status — across draft,
// active and retired lineages. No question join here; the ordered
// selection is only returned by ReadReviewTemplateUseCase.
@Injectable()
export class ListReviewTemplatesUseCase {
  constructor(
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
  ) {}

  async execute(): Promise<ListedReviewTemplate[]> {
    const templates = await this.templateRepository.findAll();

    return templates.map((template) => ({
      id: template.id,
      elementType: template.elementType,
      frequency: template.frequency,
      name: template.name,
      version: template.version,
      status: template.status,
    }));
  }
}
