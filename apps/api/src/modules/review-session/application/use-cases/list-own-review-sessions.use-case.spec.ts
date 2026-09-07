import { ReviewSession } from '../../domain/review-session.entity';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { ListOwnReviewSessionsUseCase } from './list-own-review-sessions.use-case';

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

// design.md Open Questions ("GET /review-sessions returns the actor's draft
// sessions only") — completed-session history is out of scope for this
// slice.
describe('ListOwnReviewSessionsUseCase', () => {
  let repository: InMemoryReviewSessionRepository;
  let useCase: ListOwnReviewSessionsUseCase;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    useCase = new ListOwnReviewSessionsUseCase(repository);
  });

  it("returns the caller's draft sessions only", async () => {
    repository.seed(session({ id: 'draft-1' }));
    repository.seed(
      session({
        id: 'completed-1',
        status: 'completed',
        completedAt: new Date(),
      }),
    );
    repository.seed(session({ id: 'other-user', performedById: 'user-2' }));

    const result = await useCase.execute('user-1');

    expect(result.map((s) => s.id)).toEqual(['draft-1']);
  });

  it('returns an empty list when the caller has no drafts (triangulation)', async () => {
    expect(await useCase.execute('user-1')).toEqual([]);
  });
});
