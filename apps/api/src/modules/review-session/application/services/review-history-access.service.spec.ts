import { ReviewSession } from '../../domain/review-session.entity';
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
