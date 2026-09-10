import { ReviewSession } from '../../domain/review-session.entity';
import { Community } from '../../../community/domain/community.entity';
import { InMemoryCommunityRepository } from '../../../community/application/use-cases/testing/in-memory-community.repository';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from './testing/fake-company-scope.checker';
import { InMemoryUserDirectory } from './testing/in-memory-user-directory';
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

function buildUseCase(
  sessionRepository: InMemoryReviewSessionRepository,
  communityScopeChecker: FakeCommunityScopeChecker,
  communityRepository: InMemoryCommunityRepository,
  userDirectory: InMemoryUserDirectory,
  companyScopeChecker: FakeCompanyScopeChecker = new FakeCompanyScopeChecker(),
): ListReviewHistoryUseCase {
  return new ListReviewHistoryUseCase(
    new ReviewHistoryAccessService(
      sessionRepository,
      communityScopeChecker,
      companyScopeChecker,
    ),
    communityRepository,
    userDirectory,
  );
}

// review-history design.md Decision 6, tasks.md 3.4: resolves communityName
// via CommunityRepository.findById once per DISTINCT community in the
// result, maps to rows preserving the scope-service's order.
//
// review-history-company-scope/design.md Decision 8, tasks.md 3.12:
// performedByEmail resolved via ONE UserDirectory.findEmailsByIds call over
// the distinct performedById values.
describe('ListReviewHistoryUseCase', () => {
  it('maps sessions to rows with the resolved community name and performer email', async () => {
    const sessionRepository = new InMemoryReviewSessionRepository();
    const scopeChecker = new FakeCommunityScopeChecker();
    const communityRepository = new InMemoryCommunityRepository();
    const userDirectory = new InMemoryUserDirectory();
    await communityRepository.create(
      new Community({
        id: 'community-1',
        name: 'Carrer Major 1',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: null,
      }),
    );
    userDirectory.seedEmail('user-1', 'user-1@example.com');
    sessionRepository.seed(completedSession());
    scopeChecker.assign('user-1', 'community-1');

    const useCase = buildUseCase(
      sessionRepository,
      scopeChecker,
      communityRepository,
      userDirectory,
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
        performedByEmail: 'user-1@example.com',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
  });

  it('resolves communityName once per distinct community, not per row', async () => {
    const sessionRepository = new InMemoryReviewSessionRepository();
    const scopeChecker = new FakeCommunityScopeChecker();
    const communityRepository = new InMemoryCommunityRepository();
    const userDirectory = new InMemoryUserDirectory();
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

    const useCase = buildUseCase(
      sessionRepository,
      scopeChecker,
      communityRepository,
      userDirectory,
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
    const userDirectory = new InMemoryUserDirectory();
    sessionRepository.seed(completedSession());
    scopeChecker.assign('user-1', 'community-1');

    const useCase = buildUseCase(
      sessionRepository,
      scopeChecker,
      communityRepository,
      userDirectory,
    );

    const rows = await useCase.execute({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(rows[0].communityName).toBe('');
  });

  it('resolves performedByEmail once per distinct performer across the whole result, not per row', async () => {
    const sessionRepository = new InMemoryReviewSessionRepository();
    const scopeChecker = new FakeCommunityScopeChecker();
    const communityRepository = new InMemoryCommunityRepository();
    const userDirectory = new InMemoryUserDirectory();
    userDirectory.seedEmail('user-1', 'user-1@example.com');
    userDirectory.seedEmail('user-2', 'user-2@example.com');
    const findEmailsSpy = jest.spyOn(userDirectory, 'findEmailsByIds');
    sessionRepository.seed(
      completedSession({ id: 'session-1', performedById: 'user-1' }),
    );
    sessionRepository.seed(
      completedSession({ id: 'session-2', performedById: 'user-2' }),
    );
    sessionRepository.seed(
      completedSession({
        id: 'session-3',
        performedById: 'user-1',
        completedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
    );
    // A representative sees every performer in scope — the multi-performer
    // shape this test needs. A technician only ever sees their own
    // sessions (the reversal), so that role would not exercise the
    // multi-performer batching this test asserts.
    scopeChecker.assign('rep-1', 'community-1');

    const useCase = buildUseCase(
      sessionRepository,
      scopeChecker,
      communityRepository,
      userDirectory,
    );

    const rows = await useCase.execute({
      userId: 'rep-1',
      role: 'COMMUNITY_REPRESENTATIVE',
    });

    expect(rows).toHaveLength(3);
    expect(findEmailsSpy).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => r.performedByEmail)).toEqual([
      'user-1@example.com',
      'user-2@example.com',
      'user-1@example.com',
    ]);
  });

  // tasks.md 3.15: unresolvable performedByEmail renders as '' at the
  // use-case boundary, not an error.
  it('an unresolvable performer renders performedByEmail as an empty string', async () => {
    const sessionRepository = new InMemoryReviewSessionRepository();
    const scopeChecker = new FakeCommunityScopeChecker();
    const communityRepository = new InMemoryCommunityRepository();
    const userDirectory = new InMemoryUserDirectory();
    sessionRepository.seed(completedSession());
    scopeChecker.assign('user-1', 'community-1');

    const useCase = buildUseCase(
      sessionRepository,
      scopeChecker,
      communityRepository,
      userDirectory,
    );

    const rows = await useCase.execute({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(rows[0].performedByEmail).toBe('');
  });
});
