import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { InMemoryInspectableElementRepository } from '../../../inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository';
import { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { InspectableElementNotFoundError } from '../../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { MissingObservationsError } from '../../domain/errors/missing-observations.error';
import { AnswersDoNotMatchTemplateError } from '../../domain/errors/answers-do-not-match-template.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { SessionAccessService } from '../services/session-access.service';
import type { ReviewSessionRepository } from '../ports/review-session.repository.port';
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

function element(
  overrides: Partial<InspectableElement> = {},
): InspectableElement {
  return new InspectableElement({
    id: 'element-1',
    communityId: 'community-1',
    elementType: 'EXTINGUISHER',
    name: 'Extinguisher #1',
    description: null,
    location: 'Lobby',
    installedAt: new Date('2026-01-15'),
    serialNumber: null,
    deletedAt: null,
    code: 'X1',
    deactivatedAt: null,
    ...overrides,
  });
}

// spec.md "Record an Element's Answers" + "An Unreviewed Element Requires a
// Recorded Reason" + "Completed Sessions Are Immutable". design.md
// Decision 10: one write endpoint/use case for both outcomes.
describe('RecordEntryUseCase', () => {
  let sessionRepository: InMemoryReviewSessionRepository;
  let templateRepository: InMemoryReviewTemplateRepository;
  let elementRepository: InMemoryInspectableElementRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let sessionAccess: SessionAccessService;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: RecordEntryUseCase;

  beforeEach(() => {
    sessionRepository = new InMemoryReviewSessionRepository();
    templateRepository = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    elementRepository = new InMemoryInspectableElementRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(sessionRepository, scopeChecker);
    idGenerator = { generate: jest.fn() };
    let counter = 0;
    idGenerator.generate.mockImplementation(() => `generated-${++counter}`);
    useCase = new RecordEntryUseCase(
      sessionAccess,
      sessionRepository,
      templateRepository,
      elementRepository,
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
    elementRepository.seed(element());

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
    elementRepository.seed(element());

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
    elementRepository.seed(element());

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
    elementRepository.seed(element());

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
    elementRepository.seed(element());

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
    elementRepository.seed(element());

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
    elementRepository.seed(element());

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

  // Fresh-context review finding M1: unlike complete()/discardDraft(),
  // upsertEntry() had no `WHERE status='draft'` guard of its own — the
  // domain-layer check above (session.recordEntry/markUnreviewed) only
  // protects the aggregate reference SessionAccess already loaded; a
  // concurrent complete() that commits at the DB layer between that load
  // and this use case's own write could still land silently on an
  // already-completed session. This test isolates RecordEntryUseCase's
  // OWN responsibility — mapping a `false` "lost the race" result from the
  // repository to ReviewSessionNotEditableError — with a hand-rolled
  // repository double so it does not depend on any particular fake's
  // internals (the real backstop, and its Postgres-level proof, live in
  // prisma-review-session.repository.ts / .integration.spec.ts).
  it('rejects with ReviewSessionNotEditableError when upsertEntry reports the write lost a concurrency race (returns false)', async () => {
    const session = draftSession();
    const racyRepository: ReviewSessionRepository = {
      create: jest.fn(),
      findByIdForPerformer: jest.fn().mockResolvedValue(session),
      findDraftsByPerformer: jest.fn(),
      upsertEntry: jest.fn().mockResolvedValue(false),
      complete: jest.fn(),
      discardDraft: jest.fn(),
    };
    scopeChecker.assign('user-1', 'community-1');
    const racySessionAccess = new SessionAccessService(
      racyRepository,
      scopeChecker,
    );
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    elementRepository.seed(element());
    const racyUseCase = new RecordEntryUseCase(
      racySessionAccess,
      racyRepository,
      templateRepository,
      elementRepository,
      idGenerator,
    );

    await expect(
      racyUseCase.execute(
        'session-1',
        'element-1',
        { kind: 'unreviewed', observations: 'race window' },
        actor,
      ),
    ).rejects.toThrow(ReviewSessionNotEditableError);
  });

  it('rejects with ReviewSessionNotFoundError when out of scope', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    elementRepository.seed(element());
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(sessionRepository, scopeChecker);
    useCase = new RecordEntryUseCase(
      sessionAccess,
      sessionRepository,
      templateRepository,
      elementRepository,
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

  // Fresh-context review CRITICAL finding (PR5): elementId came verbatim
  // from the URL with no check that it belongs to the session's community
  // — a technician with legitimate access to session A could record an
  // entry against an elementId from an entirely different community,
  // corrupting that other community's coverage counts silently (200 OK).
  it('rejects a cross-community elementId with InspectableElementNotFoundError', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    elementRepository.seed(element({ communityId: 'community-2' }));

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
    ).rejects.toThrow(InspectableElementNotFoundError);
  });

  // Fresh-context review CRITICAL finding (PR5): a nonexistent elementId
  // previously reached the repository's upsertEntry() unchecked and only
  // failed there via a raw Prisma P2003 FK violation that the adapter's
  // own error mapping does not recognize (it only recognizes the
  // reviewSessionId FK, not inspectableElementId) — surfacing as an
  // unhandled 500 instead of this domain 404.
  it('rejects a nonexistent elementId with InspectableElementNotFoundError instead of an unhandled error', async () => {
    sessionRepository.seed(draftSession());
    templateRepository.seed(frozenTemplate(), [
      { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
    ]);
    // Deliberately no elementRepository.seed() call.

    await expect(
      useCase.execute(
        'session-1',
        'does-not-exist',
        {
          kind: 'reviewed',
          answers: [{ questionId: 'question-1', value: 'YES' }],
        },
        actor,
      ),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });
});
