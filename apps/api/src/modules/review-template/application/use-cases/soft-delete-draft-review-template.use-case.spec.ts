import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { ReviewTemplateNotEditableError } from '../../domain/errors/review-template-not-editable.error';
import { ReviewTemplateNotFoundError } from '../../domain/errors/review-template-not-found.error';
import { ReviewTemplate } from '../../domain/review-template.entity';
import { SoftDeleteDraftReviewTemplateUseCase } from './soft-delete-draft-review-template.use-case';
import { InMemoryReviewTemplateRepository } from './testing/in-memory-review-template.repository';

function template(overrides: Partial<ReviewTemplate> = {}): ReviewTemplate {
  return new ReviewTemplate({
    id: 'template-1',
    elementType: 'EXTINGUISHER',
    frequency: 'QUARTERLY',
    name: 'Quarterly checks',
    version: null,
    status: 'draft',
    draftQuestionIds: [],
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

// spec.md "Only Drafts May Be Soft-Deleted": only a draft is soft-deletable
// (its lineage is then free for a new draft); an active or retired
// template rejects with 409 NOT_EDITABLE and remains fully visible.
describe('SoftDeleteDraftReviewTemplateUseCase', () => {
  let templateRepository: InMemoryReviewTemplateRepository;
  let useCase: SoftDeleteDraftReviewTemplateUseCase;

  beforeEach(() => {
    templateRepository = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    useCase = new SoftDeleteDraftReviewTemplateUseCase(templateRepository);
  });

  it('soft-deletes a draft, setting deletedAt', async () => {
    templateRepository.seed(template());

    await useCase.execute('template-1');

    const stored = await templateRepository.findById('template-1');
    expect(stored).toBeNull(); // ADR-010 default filter excludes it
  });

  it('rejects soft-deleting an active template with 409, leaving it visible', async () => {
    templateRepository.seed(template({ status: 'active', version: 1 }));

    await expect(useCase.execute('template-1')).rejects.toThrow(
      ReviewTemplateNotEditableError,
    );

    const stored = await templateRepository.findById('template-1');
    expect(stored?.deletedAt).toBeNull();
  });

  it('rejects soft-deleting a retired template with 409', async () => {
    templateRepository.seed(template({ status: 'retired', version: 1 }));

    await expect(useCase.execute('template-1')).rejects.toThrow(
      ReviewTemplateNotEditableError,
    );
  });

  it('rejects an unknown template id with 404', async () => {
    await expect(useCase.execute('missing')).rejects.toThrow(
      ReviewTemplateNotFoundError,
    );
  });
});
