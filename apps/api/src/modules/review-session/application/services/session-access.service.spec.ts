import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from '../use-cases/testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from '../use-cases/testing/fake-community-scope.checker';
import { SessionAccessService } from './session-access.service';

function draftSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
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

// design.md Decision 4, Layer 3: SessionAccess is the ONLY code that turns
// a sessionId into an aggregate — a use case that forgets the scope check
// has nothing else to call (ReviewSessionRepository has no findById).
describe('SessionAccessService', () => {
  let repository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let service: SessionAccessService;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    service = new SessionAccessService(repository, scopeChecker);
  });

  it('loads the session when the performer owns it and is actively assigned to its community', async () => {
    repository.seed(draftSession());
    scopeChecker.assign('user-1', 'community-1');

    const session = await service.loadForActor('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(session.id).toBe('session-1');
  });

  it('rejects an unknown sessionId with ReviewSessionNotFoundError', async () => {
    await expect(
      service.loadForActor('missing', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it("rejects another performer's session with the SAME error as unknown (indistinguishable)", async () => {
    repository.seed(draftSession({ performedById: 'user-2' }));
    scopeChecker.assign('user-1', 'community-1');

    await expect(
      service.loadForActor('session-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it('rejects when the performer owns the session but the assignment has since been deactivated', async () => {
    repository.seed(draftSession());
    // Deliberately NOT assigned via scopeChecker.assign — simulates a
    // deactivated/removed assignment (authorization spec "Deactivating an
    // assignment removes access on the next request").

    await expect(
      service.loadForActor('session-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });
});
