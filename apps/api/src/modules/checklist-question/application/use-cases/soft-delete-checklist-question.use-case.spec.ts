import {
  ChecklistQuestion,
  ChecklistQuestionProps,
} from '../../domain/checklist-question.entity';
import { ChecklistQuestionNotFoundError } from '../../domain/errors/checklist-question-not-found.error';
import { DraftSelectionCleaner } from '../ports/draft-selection-cleaner.port';
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
// use case takes no reference-COUNTING port capable of throwing/blocking —
// unlike SoftDeleteCommunityUseCase's InspectableElementCounter — which is
// the structural proof of "never blocked", not a runtime check that could
// be bypassed.
//
// Phase 7 wires DraftSelectionCleaner (design.md Decision 6): a
// fire-and-forget CLEANUP call, gated on `wasDeleted === true`, mirroring
// SoftDeleteCommunityUseCase's representative-deactivation cascade gating
// exactly. It can never reject the delete — its only job is to strip the
// id out of every draft's ordered selection after the deletion already
// succeeded.
describe('SoftDeleteChecklistQuestionUseCase', () => {
  let questionRepository: InMemoryChecklistQuestionRepository;
  let draftSelectionCleaner: jest.Mocked<DraftSelectionCleaner>;
  let useCase: SoftDeleteChecklistQuestionUseCase;

  beforeEach(() => {
    questionRepository = new InMemoryChecklistQuestionRepository();
    draftSelectionCleaner = {
      removeQuestionFromDrafts: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new SoftDeleteChecklistQuestionUseCase(
      questionRepository,
      draftSelectionCleaner,
    );
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
    expect(
      draftSelectionCleaner.removeQuestionFromDrafts,
    ).not.toHaveBeenCalled();
  });

  it('rejects with ChecklistQuestionNotFoundError for an already soft-deleted question', async () => {
    questionRepository.seed(makeQuestion({ deletedAt: new Date() }));
    const softDeleteSpy = jest.spyOn(questionRepository, 'softDeleteById');

    await expect(useCase.execute('question-1')).rejects.toThrow(
      ChecklistQuestionNotFoundError,
    );

    expect(softDeleteSpy).not.toHaveBeenCalled();
    expect(
      draftSelectionCleaner.removeQuestionFromDrafts,
    ).not.toHaveBeenCalled();
  });

  // spec.md "Deletion succeeds even when frozen templates reference the
  // question" — this use case takes no dependency CAPABLE of blocking
  // deletion; DraftSelectionCleaner only runs after softDeleteById already
  // returned true and can never make execute() reject.
  it('resolves even though a DraftSelectionCleaner is injected — deletion cannot be blocked', async () => {
    questionRepository.seed(makeQuestion());

    await expect(useCase.execute('question-1')).resolves.toBeUndefined();
  });

  // spec.md "Deletion removes the question from drafts" + design.md
  // Decision 6: the cleanup call is gated on `wasDeleted === true`, mirrors
  // SoftDeleteCommunityUseCase's representative cascade gating.
  it('calls DraftSelectionCleaner.removeQuestionFromDrafts when the question was actually deleted', async () => {
    questionRepository.seed(makeQuestion());

    await useCase.execute('question-1');

    expect(
      draftSelectionCleaner.removeQuestionFromDrafts,
    ).toHaveBeenCalledTimes(1);
    expect(draftSelectionCleaner.removeQuestionFromDrafts).toHaveBeenCalledWith(
      'question-1',
    );
  });

  // Not-found paths (already asserted above) never reach softDeleteById, so
  // wasDeleted is never true and the cleaner must never run — asserted
  // explicitly here for the concurrently-deleted race too: a
  // softDeleteById that returns false (already deleted between the
  // existence check and the write) must not trigger cleanup either.
  it('does not call DraftSelectionCleaner when softDeleteById reports wasDeleted === false', async () => {
    questionRepository.seed(makeQuestion());
    jest
      .spyOn(questionRepository, 'softDeleteById')
      .mockResolvedValueOnce(false);

    await expect(useCase.execute('question-1')).rejects.toThrow(
      ChecklistQuestionNotFoundError,
    );

    expect(
      draftSelectionCleaner.removeQuestionFromDrafts,
    ).not.toHaveBeenCalled();
  });
});
