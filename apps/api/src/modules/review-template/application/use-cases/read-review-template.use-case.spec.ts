import { ChecklistQuestion } from '../../../checklist-question/domain/checklist-question.entity';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { ReviewTemplateNotFoundError } from '../../domain/errors/review-template-not-found.error';
import { ReviewTemplate } from '../../domain/review-template.entity';
import { ReadReviewTemplateUseCase } from './read-review-template.use-case';
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

// spec.md "List and Read Templates" + "Drafts Track the Live Pool": reading
// a draft dispatches to the LIVE pool path; reading a frozen (active or
// retired) template dispatches to the snapshot-only path and MUST NOT touch
// the pool at all — the critical assertion this slice depends on (spec.md
// "that read MUST NOT... read the pool row at all").
describe('ReadReviewTemplateUseCase', () => {
  let templateRepository: InMemoryReviewTemplateRepository;
  let questionPool: InMemoryChecklistQuestionRepository;
  let useCase: ReadReviewTemplateUseCase;

  beforeEach(() => {
    questionPool = new InMemoryChecklistQuestionRepository();
    templateRepository = new InMemoryReviewTemplateRepository(questionPool);
    useCase = new ReadReviewTemplateUseCase(templateRepository);
  });

  it('reads a draft through the live pool path', async () => {
    templateRepository.seed(template({ draftQuestionIds: ['q1'] }));
    questionPool.seed(
      new ChecklistQuestion({
        id: 'q1',
        elementType: 'EXTINGUISHER',
        frequencies: ['QUARTERLY'],
        text: 'Current wording',
        deletedAt: null,
      }),
    );

    const result = await useCase.execute('template-1');

    expect(result.status).toBe('draft');
    expect(result.questions).toEqual([
      { questionId: 'q1', order: 1, text: 'Current wording' },
    ]);
  });

  it('reads an active template through the snapshot path and never calls the pool port', async () => {
    templateRepository.seed(
      template({ id: 'template-active', status: 'active', version: 1 }),
      [{ questionId: 'q1', order: 1, text: 'Frozen wording' }],
    );
    const findByIdSpy = jest.spyOn(questionPool, 'findById');

    const result = await useCase.execute('template-active');

    expect(result.status).toBe('active');
    expect(result.questions).toEqual([
      { questionId: 'q1', order: 1, text: 'Frozen wording' },
    ]);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('reads a retired template through the snapshot path and never calls the pool port', async () => {
    templateRepository.seed(
      template({ id: 'template-retired', status: 'retired', version: 1 }),
      [{ questionId: 'q1', order: 1, text: 'Old frozen wording' }],
    );
    const findByIdSpy = jest.spyOn(questionPool, 'findById');
    const findAllSpy = jest.spyOn(questionPool, 'findAll');

    const result = await useCase.execute('template-retired');

    expect(result.status).toBe('retired');
    expect(findByIdSpy).not.toHaveBeenCalled();
    expect(findAllSpy).not.toHaveBeenCalled();
  });

  it('rejects an unknown template id with 404', async () => {
    await expect(useCase.execute('missing')).rejects.toThrow(
      ReviewTemplateNotFoundError,
    );
  });

  it('rejects a soft-deleted template id with 404', async () => {
    templateRepository.seed(template({ deletedAt: new Date() }));

    await expect(useCase.execute('template-1')).rejects.toThrow(
      ReviewTemplateNotFoundError,
    );
  });
});
