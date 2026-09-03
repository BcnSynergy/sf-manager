import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { ReviewTemplateDraftExistsError } from '../../domain/errors/review-template-draft-exists.error';
import { ReviewTemplate } from '../../domain/review-template.entity';
import { CreateDraftReviewTemplateUseCase } from './create-draft-review-template.use-case';
import { InMemoryReviewTemplateRepository } from './testing/in-memory-review-template.repository';

// spec.md "Create Draft Template": at most one draft per (elementType,
// frequency) lineage at any time — a second create attempt is rejected with
// 409 DRAFT_EXISTS and no row created. An active version does not block a
// new draft. A draft for a different lineage is unaffected.
describe('CreateDraftReviewTemplateUseCase', () => {
  let templateRepository: InMemoryReviewTemplateRepository;
  let questionPool: InMemoryChecklistQuestionRepository;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: CreateDraftReviewTemplateUseCase;

  beforeEach(() => {
    questionPool = new InMemoryChecklistQuestionRepository();
    templateRepository = new InMemoryReviewTemplateRepository(questionPool);
    idGenerator = { generate: jest.fn() };
    useCase = new CreateDraftReviewTemplateUseCase(
      templateRepository,
      idGenerator,
    );
  });

  it('creates the first draft for a lineage with an empty selection', async () => {
    idGenerator.generate.mockReturnValue('template-1');

    const result = await useCase.execute({
      elementType: 'EXTINGUISHER',
      frequency: 'QUARTERLY',
      name: 'Quarterly checks',
    });

    expect(result).toEqual({
      id: 'template-1',
      elementType: 'EXTINGUISHER',
      frequency: 'QUARTERLY',
      name: 'Quarterly checks',
      status: 'draft',
      version: null,
    });

    const stored = await templateRepository.findById('template-1');
    expect(stored?.status).toBe('draft');
    expect(stored?.draftQuestionIds).toEqual([]);
    expect(stored?.deletedAt).toBeNull();
  });

  it('rejects a second draft for the same lineage, and never calls create', async () => {
    templateRepository.seed(
      new ReviewTemplate({
        id: 'existing-draft',
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: 'Existing draft',
        version: null,
        status: 'draft',
        draftQuestionIds: [],
        createdAt: new Date(),
        deletedAt: null,
      }),
    );
    const createSpy = jest.spyOn(templateRepository, 'create');

    await expect(
      useCase.execute({
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: 'Another draft',
      }),
    ).rejects.toThrow(ReviewTemplateDraftExistsError);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('allows a draft to be created alongside an active version of the same lineage', async () => {
    templateRepository.seed(
      new ReviewTemplate({
        id: 'active-1',
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: 'Active version',
        version: 1,
        status: 'active',
        draftQuestionIds: [],
        createdAt: new Date(),
        deletedAt: null,
      }),
    );
    idGenerator.generate.mockReturnValue('template-2');

    const result = await useCase.execute({
      elementType: 'EXTINGUISHER',
      frequency: 'QUARTERLY',
      name: 'Successor draft',
    });

    expect(result.status).toBe('draft');
  });

  it('allows a draft for a different lineage while one exists elsewhere', async () => {
    templateRepository.seed(
      new ReviewTemplate({
        id: 'existing-draft',
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: 'Existing draft',
        version: null,
        status: 'draft',
        draftQuestionIds: [],
        createdAt: new Date(),
        deletedAt: null,
      }),
    );
    idGenerator.generate.mockReturnValue('template-2');

    const result = await useCase.execute({
      elementType: 'EXTINGUISHER',
      frequency: 'ANNUAL',
      name: 'Different lineage',
    });

    expect(result.status).toBe('draft');
  });
});
