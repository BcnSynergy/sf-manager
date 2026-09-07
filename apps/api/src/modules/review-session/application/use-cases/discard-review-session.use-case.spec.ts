import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import { SessionAccessService } from '../services/session-access.service';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { DiscardReviewSessionUseCase } from './discard-review-session.use-case';

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

// spec.md "Discard a Draft Session": hard delete via discardDraft
// (WHERE status='draft'); false => 409 REVIEW_SESSION_NOT_EDITABLE. Only
// the opener, in scope, may discard (SessionAccess).
describe('DiscardReviewSessionUseCase', () => {
  let repository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let sessionAccess: SessionAccessService;
  let useCase: DiscardReviewSessionUseCase;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(repository, scopeChecker);
    useCase = new DiscardReviewSessionUseCase(sessionAccess, repository);
  });

  it('discards a draft session and removes it from the repository', async () => {
    repository.seed(session());
    scopeChecker.assign('user-1', 'community-1');

    await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    await expect(
      repository.findByIdForPerformer('session-1', 'user-1'),
    ).resolves.toBeNull();
  });

  it('rejects discarding a completed session with ReviewSessionNotEditableError', async () => {
    repository.seed(session({ status: 'completed', completedAt: new Date() }));
    scopeChecker.assign('user-1', 'community-1');

    await expect(
      useCase.execute('session-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotEditableError);
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
