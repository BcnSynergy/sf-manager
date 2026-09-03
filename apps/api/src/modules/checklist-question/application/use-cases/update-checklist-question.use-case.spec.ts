import {
  ChecklistQuestion,
  ChecklistQuestionProps,
} from '../../domain/checklist-question.entity';
import { ChecklistQuestionNotFoundError } from '../../domain/errors/checklist-question-not-found.error';
import { UpdateChecklistQuestionUseCase } from './update-checklist-question.use-case';
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

// spec.md "Update Checklist Question": text and/or frequencies are
// updatable; elementType is NEVER mutated (not part of `changes`, mirroring
// UpdateInspectableElementUseCase's communityId/elementType omission). A
// non-existent or soft-deleted question id is rejected with
// ChecklistQuestionNotFoundError (404 CHECKLIST_QUESTION_NOT_FOUND at the
// presentation layer, Phase 4).
describe('UpdateChecklistQuestionUseCase', () => {
  let questionRepository: InMemoryChecklistQuestionRepository;
  let useCase: UpdateChecklistQuestionUseCase;

  beforeEach(() => {
    questionRepository = new InMemoryChecklistQuestionRepository();
    useCase = new UpdateChecklistQuestionUseCase(questionRepository);
  });

  // spec.md "Admin edits a question's text at runtime"
  it("updates an existing question's text", async () => {
    questionRepository.seed(makeQuestion());

    const result = await useCase.execute({
      id: 'question-1',
      text: 'Is the pressure gauge reading correctly?',
    });

    expect(result.text).toBe('Is the pressure gauge reading correctly?');

    const stored = await questionRepository.findById('question-1');
    expect(stored?.text).toBe('Is the pressure gauge reading correctly?');
  });

  it("updates an existing question's frequencies", async () => {
    questionRepository.seed(makeQuestion());

    const result = await useCase.execute({
      id: 'question-1',
      frequencies: ['MONTHLY', 'QUARTERLY'],
    });

    expect(result.frequencies).toEqual(['MONTHLY', 'QUARTERLY']);
  });

  // spec.md "Update Checklist Question": "elementType is NOT updatable"
  it('never mutates elementType', async () => {
    questionRepository.seed(makeQuestion());

    const result = await useCase.execute({
      id: 'question-1',
      text: 'Is the pressure gauge reading correctly?',
    });

    expect(result.elementType).toBe('EXTINGUISHER');
  });

  // spec.md "Update targets a missing or soft-deleted question"
  it('rejects with ChecklistQuestionNotFoundError for a non-existent question id', async () => {
    await expect(
      useCase.execute({ id: 'missing', text: 'New text' }),
    ).rejects.toThrow(ChecklistQuestionNotFoundError);
  });

  it('rejects with ChecklistQuestionNotFoundError for a soft-deleted question', async () => {
    questionRepository.seed(makeQuestion({ deletedAt: new Date() }));

    await expect(
      useCase.execute({ id: 'question-1', text: 'New text' }),
    ).rejects.toThrow(ChecklistQuestionNotFoundError);
  });
});
