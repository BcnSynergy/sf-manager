import {
  ChecklistQuestion,
  ChecklistQuestionProps,
} from '../../domain/checklist-question.entity';
import { ChecklistQuestionNotFoundError } from '../../domain/errors/checklist-question-not-found.error';
import { SoftDeleteChecklistQuestionUseCase } from './soft-delete-checklist-question.use-case';
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

// spec.md "Soft-Delete Checklist Question Is Never Blocked": deletion is
// NEVER guarded by template references — the deliberate inverse of the
// community/maintenance-company delete guards, because a frozen template
// is an audit snapshot, not a live dependency (design.md Decision 6). This
// use case takes no reference-count port at all, unlike
// SoftDeleteCommunityUseCase — that is the structural proof of "never
// blocked", not a runtime check that could be bypassed.
//
// `softDeleteById` returns `wasDeleted` (mirrors SoftDeleteCommunityUseCase)
// so a future DraftSelectionCleaner call (Phase 7, design.md Decision 6)
// can be gated on `wasDeleted === true` without a signature change — NOT
// wired in this PR.
describe('SoftDeleteChecklistQuestionUseCase', () => {
  let questionRepository: InMemoryChecklistQuestionRepository;
  let useCase: SoftDeleteChecklistQuestionUseCase;

  beforeEach(() => {
    questionRepository = new InMemoryChecklistQuestionRepository();
    useCase = new SoftDeleteChecklistQuestionUseCase(questionRepository);
  });

  // spec.md "Admin soft-deletes an unreferenced question"
  it('soft-deletes an active question by setting deletedAt', async () => {
    questionRepository.seed(makeQuestion());

    await useCase.execute('question-1');

    expect(await questionRepository.findById('question-1')).toBeNull();
  });

  // spec.md "Delete targets a missing or already-deleted question"
  it('rejects with ChecklistQuestionNotFoundError for a non-existent question id', async () => {
    const softDeleteSpy = jest.spyOn(questionRepository, 'softDeleteById');

    await expect(useCase.execute('missing')).rejects.toThrow(
      ChecklistQuestionNotFoundError,
    );

    expect(softDeleteSpy).not.toHaveBeenCalled();
  });

  it('rejects with ChecklistQuestionNotFoundError for an already soft-deleted question', async () => {
    questionRepository.seed(makeQuestion({ deletedAt: new Date() }));
    const softDeleteSpy = jest.spyOn(questionRepository, 'softDeleteById');

    await expect(useCase.execute('question-1')).rejects.toThrow(
      ChecklistQuestionNotFoundError,
    );

    expect(softDeleteSpy).not.toHaveBeenCalled();
  });

  // spec.md "Deletion succeeds even when frozen templates reference the
  // question" — this use case has no dependency capable of blocking it;
  // asserting the constructor takes only the repository proves that
  // structurally.
  it('takes no counter or reference-checking dependency, so deletion cannot be blocked', async () => {
    questionRepository.seed(makeQuestion());

    await expect(useCase.execute('question-1')).resolves.toBeUndefined();
  });
});
