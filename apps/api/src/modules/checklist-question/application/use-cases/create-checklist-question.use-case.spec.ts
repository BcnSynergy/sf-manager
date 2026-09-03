import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { InvalidChecklistQuestionInputError } from '../../domain/errors/invalid-checklist-question-input.error';
import { CreateChecklistQuestionUseCase } from './create-checklist-question.use-case';
import { InMemoryChecklistQuestionRepository } from './testing/in-memory-checklist-question.repository';

// spec.md "Create Checklist Question": id is generated (UUIDv7), deletedAt
// initializes to null, text is stored verbatim, no uniqueness on any field
// (duplicate text allowed), a question may carry several frequencies. Empty
// frequencies and missing/blank required fields are rejected (this use
// case's own defense-in-depth guard, mirrored by createChecklistQuestionSchema,
// task 3.7).
describe('CreateChecklistQuestionUseCase', () => {
  let questionRepository: InMemoryChecklistQuestionRepository;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: CreateChecklistQuestionUseCase;

  beforeEach(() => {
    questionRepository = new InMemoryChecklistQuestionRepository();
    idGenerator = { generate: jest.fn() };
    useCase = new CreateChecklistQuestionUseCase(
      questionRepository,
      idGenerator,
    );
  });

  it('creates a question with a generated id and deletedAt null', async () => {
    idGenerator.generate.mockReturnValue('question-1');

    const result = await useCase.execute({
      elementType: 'EXTINGUISHER',
      frequencies: ['ANNUAL'],
      text: 'Is the pressure gauge in the green zone?',
    });

    expect(result).toEqual({
      id: 'question-1',
      elementType: 'EXTINGUISHER',
      frequencies: ['ANNUAL'],
      text: 'Is the pressure gauge in the green zone?',
    });

    const stored = await questionRepository.findById('question-1');
    expect(stored?.deletedAt).toBeNull();
  });

  // spec.md "A question may carry several frequencies"
  it('persists a question tagged with multiple frequencies', async () => {
    idGenerator.generate.mockReturnValue('question-1');

    const result = await useCase.execute({
      elementType: 'EXTINGUISHER',
      frequencies: ['QUARTERLY', 'ANNUAL'],
      text: 'Is the hose free of visible cracks?',
    });

    expect(result.frequencies).toEqual(['QUARTERLY', 'ANNUAL']);
  });

  // spec.md "Duplicate text is allowed"
  it('allows two questions with identical text to coexist', async () => {
    idGenerator.generate
      .mockReturnValueOnce('question-1')
      .mockReturnValueOnce('question-2');

    await useCase.execute({
      elementType: 'EXTINGUISHER',
      frequencies: ['ANNUAL'],
      text: 'Is the hose free of visible cracks?',
    });
    const second = await useCase.execute({
      elementType: 'EXTINGUISHER',
      frequencies: ['MONTHLY'],
      text: 'Is the hose free of visible cracks?',
    });

    expect(second.id).toBe('question-2');
    const all = await questionRepository.findAll();
    expect(all).toHaveLength(2);
  });

  // spec.md "Empty frequencies set rejected"
  it('rejects an empty frequencies set, and never calls create', async () => {
    idGenerator.generate.mockReturnValue('question-1');
    const createSpy = jest.spyOn(questionRepository, 'create');

    await expect(
      useCase.execute({
        elementType: 'EXTINGUISHER',
        frequencies: [],
        text: 'Is the hose free of visible cracks?',
      }),
    ).rejects.toThrow(InvalidChecklistQuestionInputError);

    expect(createSpy).not.toHaveBeenCalled();
  });

  // spec.md "Missing or blank required field rejected"
  it('rejects a missing elementType, and never calls create', async () => {
    const createSpy = jest.spyOn(questionRepository, 'create');

    await expect(
      useCase.execute({
        elementType: undefined as never,
        frequencies: ['ANNUAL'],
        text: 'Is the hose free of visible cracks?',
      }),
    ).rejects.toThrow(InvalidChecklistQuestionInputError);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing frequencies field, and never calls create', async () => {
    const createSpy = jest.spyOn(questionRepository, 'create');

    await expect(
      useCase.execute({
        elementType: 'EXTINGUISHER',
        frequencies: undefined as never,
        text: 'Is the hose free of visible cracks?',
      }),
    ).rejects.toThrow(InvalidChecklistQuestionInputError);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects blank text, and never calls create', async () => {
    const createSpy = jest.spyOn(questionRepository, 'create');

    await expect(
      useCase.execute({
        elementType: 'EXTINGUISHER',
        frequencies: ['ANNUAL'],
        text: '   ',
      }),
    ).rejects.toThrow(InvalidChecklistQuestionInputError);

    expect(createSpy).not.toHaveBeenCalled();
  });
});
