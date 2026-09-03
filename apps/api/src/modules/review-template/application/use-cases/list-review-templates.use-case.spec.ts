import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { ReviewTemplate } from '../../domain/review-template.entity';
import { ListReviewTemplatesUseCase } from './list-review-templates.use-case';
import { InMemoryReviewTemplateRepository } from './testing/in-memory-review-template.repository';

function template(overrides: Partial<ReviewTemplate>): ReviewTemplate {
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

// spec.md "List and Read Templates": lists all non-soft-deleted templates
// with elementType, frequency, name, version and status, across draft,
// active and retired. Soft-deleted drafts are excluded.
describe('ListReviewTemplatesUseCase', () => {
  let templateRepository: InMemoryReviewTemplateRepository;
  let useCase: ListReviewTemplatesUseCase;

  beforeEach(() => {
    templateRepository = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    useCase = new ListReviewTemplatesUseCase(templateRepository);
  });

  it('lists templates across lineages and statuses', async () => {
    templateRepository.seed(template({ id: 't-draft', status: 'draft' }));
    templateRepository.seed(
      template({ id: 't-active', status: 'active', version: 1 }),
    );
    templateRepository.seed(
      template({ id: 't-retired', status: 'retired', version: 1 }),
    );

    const result = await useCase.execute();

    expect(result).toHaveLength(3);
    expect(result.map((t) => t.status).sort()).toEqual([
      'active',
      'draft',
      'retired',
    ]);
  });

  it('excludes soft-deleted drafts', async () => {
    templateRepository.seed(
      template({ id: 't-deleted', status: 'draft', deletedAt: new Date() }),
    );

    const result = await useCase.execute();

    expect(result).toHaveLength(0);
  });
});
