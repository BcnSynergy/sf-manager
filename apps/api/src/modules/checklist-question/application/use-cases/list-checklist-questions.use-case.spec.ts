import {
  ChecklistQuestion,
  ChecklistQuestionProps,
} from '../../domain/checklist-question.entity';
import { ListChecklistQuestionsUseCase } from './list-checklist-questions.use-case';
import { InMemoryChecklistQuestionRepository } from './testing/in-memory-checklist-question.repository';

const makeQuestion = (
  overrides: Partial<ChecklistQuestionProps> = {},
): ChecklistQuestion =>
  new ChecklistQuestion({
    id: 'question-1',
    elementType: 'EXTINGUISHER',
    frequencies: ['ANNUAL'],
    text: 'Is the pressure gauge in the green zone?',
    deletedAt: null,
    ...overrides,
  });

// spec.md "List Checklist Questions": global pool, no parent guard. Soft-
// deleted questions excluded (ADR-010); an empty pool is a valid 2xx
// response, not an error (spec.md "The Pool Ships Empty").
describe('ListChecklistQuestionsUseCase', () => {
  let questionRepository: InMemoryChecklistQuestionRepository;
  let useCase: ListChecklistQuestionsUseCase;

  beforeEach(() => {
    questionRepository = new InMemoryChecklistQuestionRepository();
    useCase = new ListChecklistQuestionsUseCase(questionRepository);
  });

  it('lists active questions with their fields', async () => {
    questionRepository.seed(makeQuestion());

    const result = await useCase.execute();

    expect(result).toEqual([
      {
        id: 'question-1',
        elementType: 'EXTINGUISHER',
        frequencies: ['ANNUAL'],
        text: 'Is the pressure gauge in the green zone?',
      },
    ]);
  });

  // spec.md "Soft-deleted questions excluded"
  it('excludes a soft-deleted question from the list', async () => {
    questionRepository.seed(makeQuestion({ deletedAt: new Date() }));

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  // spec.md "Empty pool is a valid response" / "The Pool Ships Empty"
  it('returns an empty array when no questions have ever been created', async () => {
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
