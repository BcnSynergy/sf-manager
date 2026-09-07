import { ReviewSession } from '../../domain/review-session.entity';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { SessionAccessService } from '../services/session-access.service';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { ReadReviewSessionUseCase } from './read-review-session.use-case';

function session(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return new ReviewSession({
    id: 'session-1',
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status: 'draft',
    startedAt: new Date('2026-09-07T00:00:00.000Z'),
    completedAt: null,
    ...overrides,
  });
}

// design.md Decision 11: "GET /review-sessions/:sessionId returns entries
// and coverage counts, not the question set" — reached exclusively through
// SessionAccess (design.md Decision 4, Layer 3).
describe('ReadReviewSessionUseCase', () => {
  let repository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let sessionAccess: SessionAccessService;
  let useCase: ReadReviewSessionUseCase;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(repository, scopeChecker);
    useCase = new ReadReviewSessionUseCase(sessionAccess);
  });

  it('returns the session with entries and coverage counts', async () => {
    const reviewed = session();
    reviewed.recordEntry(
      ElementReviewEntry.reviewed({
        id: 'entry-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        answers: [
          new QuestionAnswer({
            id: 'answer-1',
            elementReviewEntryId: 'entry-1',
            questionId: 'question-1',
            answer: 'YES',
          }),
        ],
        recordedAt: new Date(),
      }),
    );
    reviewed.recordEntry(
      ElementReviewEntry.unreviewed({
        id: 'entry-2',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-2',
        observations: 'Room sealed, could not access',
        recordedAt: new Date(),
      }),
    );
    repository.seed(reviewed);
    scopeChecker.assign('user-1', 'community-1');

    const result = await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.id).toBe('session-1');
    expect(result.status).toBe('draft');
    expect(result.entries).toHaveLength(2);
    expect(result.coverage).toEqual({ reviewed: 1, unreviewed: 1 });
  });

  it('rejects an out-of-scope session with ReviewSessionNotFoundError', async () => {
    repository.seed(session());
    // Not assigned via scopeChecker.

    await expect(
      useCase.execute('session-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });
});
