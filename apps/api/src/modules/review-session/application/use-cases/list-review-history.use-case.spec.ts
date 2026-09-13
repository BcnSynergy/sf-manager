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

  // review-history-admin-scope PR1 fix-up (4R fresh-context review CRITICAL
  // #2, post-b8fb5a9): SYSTEM_ADMIN's installation-wide branch removed the
  // implicit bound that kept the old sequential `for`-`await` loop safe.
  // Proves the fix is actually concurrent (`Promise.all`), not just
  // correct: both `findById` calls must fire before EITHER resolves. A
  // sequential `for`-`await` loop would only issue the second call after
  // the first settles, so this test hangs/fails under the old
  // implementation and passes only once the calls are fired together.
  it('calls communityRepository.findById concurrently for all distinct communities, not sequentially', async () => {
    const sessionRepository = new InMemoryReviewSessionRepository();
    const scopeChecker = new FakeCommunityScopeChecker();
    const userDirectory = new InMemoryUserDirectory();
    sessionRepository.seed(
      completedSession({
        id: 'session-1',
        communityId: 'community-1',
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    sessionRepository.seed(
      completedSession({
        id: 'session-2',
        communityId: 'community-2',
        completedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );
    scopeChecker.assign('rep-1', 'community-1');
    scopeChecker.assign('rep-1', 'community-2');

    const calledIds: string[] = [];
    const resolvers: Array<() => void> = [];
    const communityRepository = {
      findById: jest.fn((id: string) => {
        calledIds.push(id);
        return new Promise((resolve) => {
          resolvers.push(() =>
            resolve(
              new Community({
                id,
                name: `Name for ${id}`,
                address: 'irrelevant',
                locale: 'ca',
                deletedAt: null,
              }),
            ),
          );
        });
      }),
    } as unknown as InMemoryCommunityRepository;

    const useCase = buildUseCase(
      sessionRepository,
      scopeChecker,
      communityRepository,
      userDirectory,
    );

    const resultPromise = useCase.execute({
      userId: 'rep-1',
      role: 'COMMUNITY_REPRESENTATIVE',
    });

    // Flush pending microtasks so the (still-unresolved) findById promises
    // have had a chance to be created, WITHOUT resolving any of them. Several
    // ticks are needed: listForActor -> listAssignedCommunityIds ->
    // findCompletedInCommunities all await in sequence before execute()
    // reaches the community-name resolution loop.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    expect(calledIds.sort()).toEqual(['community-1', 'community-2']);
    expect(resolvers).toHaveLength(2);

    resolvers.forEach((resolve) => resolve());
    const rows = await resultPromise;

    expect(rows.map((r) => r.communityName).sort()).toEqual([
      'Name for community-1',
      'Name for community-2',
    ]);
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
