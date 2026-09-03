import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { ChecklistQuestion } from '../../../checklist-question/domain/checklist-question.entity';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { ReviewTemplateEmptyError } from '../../domain/errors/review-template-empty.error';
import { ReviewTemplateNotEditableError } from '../../domain/errors/review-template-not-editable.error';
import { ReviewTemplateNotFoundError } from '../../domain/errors/review-template-not-found.error';
import { ReviewTemplate } from '../../domain/review-template.entity';
import { ActivateReviewTemplateUseCase } from './activate-review-template.use-case';
import { InMemoryReviewTemplateRepository } from './testing/in-memory-review-template.repository';

function draftTemplate(
  overrides: Partial<ReviewTemplate> = {},
): ReviewTemplate {
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

// spec.md "Activation Freezes the Template...Atomically": pure guards run
// BEFORE any repo call — not-draft ⇒ 409 NOT_EDITABLE, empty selection ⇒
// 409 EMPTY as a fast path. The actual atomic snapshot transaction is Phase
// 9's job in the repository adapter; this use case only pre-flights and
// delegates to repo.activate().
describe('ActivateReviewTemplateUseCase', () => {
  let templateRepository: InMemoryReviewTemplateRepository;
  let questionPool: InMemoryChecklistQuestionRepository;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: ActivateReviewTemplateUseCase;

  beforeEach(() => {
    questionPool = new InMemoryChecklistQuestionRepository();
    templateRepository = new InMemoryReviewTemplateRepository(questionPool);
    idGenerator = { generate: jest.fn() };
    useCase = new ActivateReviewTemplateUseCase(
      templateRepository,
      idGenerator,
    );
  });

  it('activates the first version of a lineage with version 1', async () => {
    templateRepository.seed(draftTemplate({ draftQuestionIds: ['q1'] }));
    questionPool.seed(
      new ChecklistQuestion({
        id: 'q1',
        elementType: 'EXTINGUISHER',
        frequencies: ['QUARTERLY'],
        text: 'Is the pressure gauge in the green zone?',
        deletedAt: null,
      }),
    );
    idGenerator.generate.mockReturnValue('row-1');

    const result = await useCase.execute('template-1');

    expect(result).toEqual({ id: 'template-1', status: 'active', version: 1 });
  });

  it('rejects activating a template that is not a draft, without calling repo.activate', async () => {
    templateRepository.seed(draftTemplate({ status: 'active', version: 1 }));
    const activateSpy = jest.spyOn(templateRepository, 'activate');

    await expect(useCase.execute('template-1')).rejects.toThrow(
      ReviewTemplateNotEditableError,
    );

    expect(activateSpy).not.toHaveBeenCalled();
  });

  it('rejects activating a retired template, without calling repo.activate', async () => {
    templateRepository.seed(draftTemplate({ status: 'retired', version: 1 }));
    const activateSpy = jest.spyOn(templateRepository, 'activate');

    await expect(useCase.execute('template-1')).rejects.toThrow(
      ReviewTemplateNotEditableError,
    );

    expect(activateSpy).not.toHaveBeenCalled();
  });

  it('rejects activating an empty draft as a fast path, without calling repo.activate', async () => {
    templateRepository.seed(draftTemplate({ draftQuestionIds: [] }));
    const activateSpy = jest.spyOn(templateRepository, 'activate');

    await expect(useCase.execute('template-1')).rejects.toThrow(
      ReviewTemplateEmptyError,
    );

    expect(activateSpy).not.toHaveBeenCalled();
  });

  it('rejects an unknown template id with 404', async () => {
    await expect(useCase.execute('missing')).rejects.toThrow(
      ReviewTemplateNotFoundError,
    );
  });
});
