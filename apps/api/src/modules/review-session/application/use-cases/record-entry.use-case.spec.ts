import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { MissingObservationsError } from '../../domain/errors/missing-observations.error';
import { AnswersDoNotMatchTemplateError } from '../../domain/errors/answers-do-not-match-template.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { SessionAccessService } from '../services/session-access.service';
import { RecordEntryUseCase } from './record-entry.use-case';

function draftSession(
  overrides: Partial<{ status: 'draft' | 'completed' }> = {},
): ReviewSession {
  return new ReviewSession({
    id: 'session-1',
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status: overrides.status ?? 'draft',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: overrides.status === 'completed' ? new Date() : null,
  });
}

function frozenTemplate(): ReviewTemplate {
  return new ReviewTemplate({
    id: 'template-1',
    elementType: 'EXTINGUISHER',
    frequency: 'QUARTERLY',
    name: 'Quarterly checks',
    version: 1,
    status: 'active',
    draftQuestionIds: [],
    createdAt: new Date(),
    deletedAt: null,
  });
}

// spec.md "Record an Element's Answers" + "An Unreviewed Element Requires a
// Recorded Reason" + "Completed Sessions Are Immutable". design.md
// Decision 10: one write endpoint/use case for both outcomes.
describe('RecordEntryUseCase', () => {
  let sessionRepository: InMemoryReviewSessionRepository;
  let templateRepository: InMemoryReviewTemplateRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let sessionAccess: SessionAccessService;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: RecordEntryUseCase;

  beforeEach(() => {
    sessionRepository = new InMemoryReviewSessionRepository();
    templateRepository = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(sessionRepository, scopeChecker);
    idGenerator = { generate: jest.fn() };
    let counter = 0;
    idGenerator.generate.mockImplementation(() => `generated-${++counter}`);
    useCase = new RecordEntryUseCase(
      sessionAccess,
      sessionRepository,
      templateRepository,
      idGenerator,
    );
    scopeChecker.assign('user-1', 'community-1');
  });

  const actor = { userId: 'user-1', role: 'MAINTENANCE_TECHNICIAN' as const };

  it('records a full answer set for a resolved element', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);

    const result = await useCase.execute(
      'session-1',
      'element-1',
      {
        kind: 'reviewed',
        answers: [{ questionId: 'question-1', value: 'YES' }],
      },
      actor,
    );

    expect(result.reviewed).toBe(true);
    expect(result.answers).toEqual([
      { questionId: 'question-1', answer: 'YES' },
    ]);

    const stored = await sessionRepository.findByIdForPerformer(
      'session-1',
      'user-1',
    );
    expect(stored?.entries[0].answers).toHaveLength(1);
  });

  it('re-recording the same element replaces rather than duplicates', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);

    await useCase.execute(
      'session-1',
      'element-1',
      {
        kind: 'reviewed',
        answers: [{ questionId: 'question-1', value: 'NO' }],
      },
      actor,
    );
    await useCase.execute(
      'session-1',
      'element-1',
      {
        kind: 'reviewed',
        answers: [{ questionId: 'question-1', value: 'YES' }],
      },
      actor,
    );

    const stored = await sessionRepository.findByIdForPerformer(
      'session-1',
      'user-1',
    );
    expect(stored?.entries).toHaveLength(1);
    expect(stored?.entries[0].answers[0].answer).toBe('YES');
  });

  it('records an unreviewed element with a reason', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);

    const result = await useCase.execute(
      'session-1',
      'element-1',
      { kind: 'unreviewed', observations: 'sealed room, no access' },
      actor,
    );

    expect(result.reviewed).toBe(false);
    expect(result.observations).toBe('sealed room, no access');
  });

  it('rejects a blank observations reason with MissingObservationsError', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate());

    await expect(
      useCase.execute(
        'session-1',
        'element-1',
        { kind: 'unreviewed', observations: '   ' },
        actor,
      ),
    ).rejects.toThrow(MissingObservationsError);
  });

  it('rejects an incomplete answer set with AnswersDoNotMatchTemplateError', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
      {
        questionId: 'question-2',
        order: 2,
        text: 'Is the pressure gauge green?',
      },
    ]);

    await expect(
      useCase.execute(
        'session-1',
        'element-1',
        {
          kind: 'reviewed',
          answers: [{ questionId: 'question-1', value: 'YES' }],
        },
        actor,
      ),
    ).rejects.toThrow(AnswersDoNotMatchTemplateError);
  });

  it('rejects an answer for a question outside the frozen snapshot with AnswersDoNotMatchTemplateError', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);

    await expect(
      useCase.execute(
        'session-1',
        'element-1',
        {
          kind: 'reviewed',
          answers: [{ questionId: 'question-unknown', value: 'YES' }],
        },
        actor,
      ),
    ).rejects.toThrow(AnswersDoNotMatchTemplateError);
  });

  it('rejects recording against a completed session with ReviewSessionNotEditableError', async () => {
    sessionRepository.seed(draftSession({ status: 'completed' }));
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);

    await expect(
      useCase.execute(
        'session-1',
        'element-1',
        {
          kind: 'reviewed',
          answers: [{ questionId: 'question-1', value: 'YES' }],
        },
        actor,
      ),
    ).rejects.toThrow(ReviewSessionNotEditableError);
  });

  it('rejects with ReviewSessionNotFoundError when out of scope', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(sessionRepository, scopeChecker);
    useCase = new RecordEntryUseCase(
      sessionAccess,
      sessionRepository,
      templateRepository,
      idGenerator,
    );

    await expect(
      useCase.execute(
        'session-1',
        'element-1',
        { kind: 'unreviewed', observations: 'sealed room, no access' },
        actor,
      ),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });
});
