import { ReviewSession } from '../../domain/review-session.entity';
import { Community } from '../../../community/domain/community.entity';
import { InMemoryCommunityRepository } from '../../../community/application/use-cases/testing/in-memory-community.repository';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import { ListReviewHistoryUseCase } from './list-review-history.use-case';

function completedSession(
  overrides: Partial<{
    id: string;
    communityId: string;
    performedById: string;
    completedAt: Date;
  }> = {},
): ReviewSession {
  return new ReviewSession({
    id: overrides.id ?? 'session-1',
    communityId: overrides.communityId ?? 'community-1',
    templateId: 'template-1',
    performedById: overrides.performedById ?? 'user-1',
    status: 'completed',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: overrides.completedAt ?? new Date('2026-01-02T00:00:00.000Z'),
  });
}

// review-history design.md Decision 6, tasks.md 3.4: resolves communityName
// via CommunityRepository.findById once per DISTINCT community in the
// result, maps to rows preserving the scope-service's order.
describe('ListReviewHistoryUseCase', () => {
  it('maps sessions to rows with the resolved community name', async () => {
    const sessionRepository = new InMemoryReviewSessionRepository();
    const scopeChecker = new FakeCommunityScopeChecker();
    const communityRepository = new InMemoryCommunityRepository();
    await communityRepository.create(
      new Community({
        id: 'community-1',
        name: 'Carrer Major 1',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: null,
      }),
    );
    sessionRepository.seed(completedSession());
    scopeChecker.assign('user-1', 'community-1');

    const useCase = new ListReviewHistoryUseCase(
      new ReviewHistoryAccessService(sessionRepository, scopeChecker),
      communityRepository,
    );

    const rows = await useCase.execute({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(rows).toEqual([
      {
        id: 'session-1',
        communityId: 'community-1',
        communityName: 'Carrer Major 1',
        performedById: 'user-1',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
  });

  it('resolves communityName once per distinct community, not per row', async () => {
    const sessionRepository = new InMemoryReviewSessionRepository();
    const scopeChecker = new FakeCommunityScopeChecker();
    const communityRepository = new InMemoryCommunityRepository();
    await communityRepository.create(
      new Community({
        id: 'community-1',
        name: 'Community One',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: null,
      }),
    );
    const findByIdSpy = jest.spyOn(communityRepository, 'findById');
    sessionRepository.seed(
      completedSession({
        id: 'session-1',
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    sessionRepository.seed(
      completedSession({
        id: 'session-2',
        completedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );
    scopeChecker.assign('user-1', 'community-1');

    const useCase = new ListReviewHistoryUseCase(
      new ReviewHistoryAccessService(sessionRepository, scopeChecker),
      communityRepository,
    );

    const rows = await useCase.execute({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(rows).toHaveLength(2);
    expect(findByIdSpy).toHaveBeenCalledTimes(1);
  });

  it('an unknown community resolves to an empty communityName rather than throwing', async () => {
    const sessionRepository = new InMemoryReviewSessionRepository();
    const scopeChecker = new FakeCommunityScopeChecker();
    const communityRepository = new InMemoryCommunityRepository();
    sessionRepository.seed(completedSession());
    scopeChecker.assign('user-1', 'community-1');

    const useCase = new ListReviewHistoryUseCase(
      new ReviewHistoryAccessService(sessionRepository, scopeChecker),
      communityRepository,
    );

    const rows = await useCase.execute({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(rows[0].communityName).toBe('');
  });
});
