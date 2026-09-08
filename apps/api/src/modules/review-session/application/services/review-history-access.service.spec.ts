import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from '../use-cases/testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from '../use-cases/testing/fake-community-scope.checker';
import { ReviewHistoryAccessService } from './review-history-access.service';
import type { Role } from '../../../users/domain/role';

function completedSession(
  overrides: Partial<{
    id: string;
    communityId: string;
    performedById: string;
  }> = {},
): ReviewSession {
  return new ReviewSession({
    id: overrides.id ?? 'session-1',
    communityId: overrides.communityId ?? 'community-1',
    templateId: 'template-1',
    performedById: overrides.performedById ?? 'user-1',
    status: 'completed',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
}

// design.md Decision 1, tasks.md 3.1/3.2/3.3: role dispatch — a technician
// hits the ForPerformer repository method, a representative hits the
// community one, every other role reaches NO repository call and yields
// `[]`.
describe('ReviewHistoryAccessService.listForActor', () => {
  let repository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let service: ReviewHistoryAccessService;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    service = new ReviewHistoryAccessService(repository, scopeChecker);
  });

  it('a technician sees only their own completed sessions in scope', async () => {
    repository.seed(completedSession({ id: 'own', performedById: 'user-1' }));
    repository.seed(completedSession({ id: 'other', performedById: 'user-2' }));
    scopeChecker.assign('user-1', 'community-1');

    const result = await service.listForActor({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.map((s) => s.id)).toEqual(['own']);
  });

  it('a representative sees every performer in their community scope', async () => {
    repository.seed(
      completedSession({
        id: 'performed-by-technician',
        performedById: 'user-2',
      }),
    );
    scopeChecker.assign('rep-1', 'community-1');

    const result = await service.listForActor({
      userId: 'rep-1',
      role: 'COMMUNITY_REPRESENTATIVE',
    });

    expect(result.map((s) => s.id)).toEqual(['performed-by-technician']);
  });

  it('an empty community scope short-circuits to [] without a repository call', async () => {
    const spy = jest.spyOn(
      repository,
      'findCompletedForPerformerInCommunities',
    );

    const result = await service.listForActor({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each<Role>(['SYSTEM_ADMIN', 'MANAGER', 'MAINTENANCE_COMPANY_MANAGER'])(
    '%s reaches no repository call and yields []',
    async (role) => {
      scopeChecker.assign('user-1', 'community-1');
      const listSpy = jest.spyOn(
        repository,
        'findCompletedForPerformerInCommunities',
      );
      const communitySpy = jest.spyOn(repository, 'findCompletedInCommunities');

      const result = await service.listForActor({ userId: 'user-1', role });

      expect(result).toEqual([]);
      expect(listSpy).not.toHaveBeenCalled();
      expect(communitySpy).not.toHaveBeenCalled();
    },
  );

  it('refuses (yields []) for a role value outside the Role union', async () => {
    scopeChecker.assign('user-1', 'community-1');

    const result = await service.listForActor({
      userId: 'user-1',
      role: 'NOT_A_REAL_ROLE' as unknown as Role,
    });

    expect(result).toEqual([]);
  });
});

// review-history design.md Decision 1, tasks.md 4.1/4.2: the by-id
// counterpart to listForActor — same exhaustive role dispatch, but to the
// two by-id repository methods, and `null` collapses to
// ReviewSessionNotFoundError (ONE throw site, ONE mapping — mirrors
// SessionAccessService.loadForActor).
describe('ReviewHistoryAccessService.loadCompletedForActor', () => {
  let repository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let service: ReviewHistoryAccessService;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    service = new ReviewHistoryAccessService(repository, scopeChecker);
  });

  it('a technician reads back their own completed session', async () => {
    const session = completedSession({
      id: 'own',
      performedById: 'user-1',
      communityId: 'community-1',
    });
    repository.seed(session);
    scopeChecker.assign('user-1', 'community-1');

    const result = await service.loadCompletedForActor('own', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.id).toBe('own');
  });

  it('a representative reads back a session they did not perform', async () => {
    const session = completedSession({
      id: 'performed-by-technician',
      performedById: 'user-2',
      communityId: 'community-1',
    });
    repository.seed(session);
    scopeChecker.assign('rep-1', 'community-1');

    const result = await service.loadCompletedForActor(
      'performed-by-technician',
      { userId: 'rep-1', role: 'COMMUNITY_REPRESENTATIVE' },
    );

    expect(result.id).toBe('performed-by-technician');
  });

  it.each<[string, () => void]>([
    [
      'an unknown sessionId',
      () => {
        scopeChecker.assign('user-1', 'community-1');
      },
    ],
    [
      "another performer's session",
      () => {
        repository.seed(
          completedSession({
            id: 'foreign-performer',
            performedById: 'user-2',
            communityId: 'community-1',
          }),
        );
        scopeChecker.assign('user-1', 'community-1');
      },
    ],
    [
      "another community's session",
      () => {
        repository.seed(
          completedSession({
            id: 'foreign-community',
            performedById: 'user-1',
            communityId: 'community-2',
          }),
        );
        scopeChecker.assign('user-1', 'community-1');
      },
    ],
    [
      'a since-deactivated assignment',
      () => {
        repository.seed(
          completedSession({
            id: 'deactivated',
            performedById: 'user-1',
            communityId: 'community-1',
          }),
        );
        // Deliberately no scopeChecker.assign() — the empty scope is what a
        // deactivated assignment looks like from Layer 2's point of view.
      },
    ],
  ])('%s collapses to ReviewSessionNotFoundError', async (_label, seed) => {
    seed();
    const sessionId =
      _label === 'an unknown sessionId'
        ? 'nonexistent'
        : _label === "another performer's session"
          ? 'foreign-performer'
          : _label === "another community's session"
            ? 'foreign-community'
            : 'deactivated';

    await expect(
      service.loadCompletedForActor(sessionId, {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it('a draft session collapses to ReviewSessionNotFoundError (completed-only)', async () => {
    const draft = new ReviewSession({
      id: 'draft-1',
      communityId: 'community-1',
      templateId: 'template-1',
      performedById: 'user-1',
      status: 'draft',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
    });
    repository.seed(draft);
    scopeChecker.assign('user-1', 'community-1');

    await expect(
      service.loadCompletedForActor('draft-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it.each<Role>(['SYSTEM_ADMIN', 'MANAGER', 'MAINTENANCE_COMPANY_MANAGER'])(
    '%s reaches no repository call and gets ReviewSessionNotFoundError',
    async (role) => {
      const session = completedSession({
        id: 'session-x',
        performedById: 'user-1',
        communityId: 'community-1',
      });
      repository.seed(session);
      scopeChecker.assign('user-1', 'community-1');
      const byPerformerSpy = jest.spyOn(
        repository,
        'findCompletedByIdForPerformerInCommunities',
      );
      const byCommunitySpy = jest.spyOn(
        repository,
        'findCompletedByIdInCommunities',
      );

      await expect(
        service.loadCompletedForActor('session-x', { userId: 'user-1', role }),
      ).rejects.toThrow(ReviewSessionNotFoundError);
      expect(byPerformerSpy).not.toHaveBeenCalled();
      expect(byCommunitySpy).not.toHaveBeenCalled();
    },
  );
});
