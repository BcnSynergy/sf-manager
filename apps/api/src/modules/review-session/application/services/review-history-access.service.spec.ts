import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from '../use-cases/testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from '../use-cases/testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from '../use-cases/testing/fake-company-scope.checker';
import { ReviewHistoryAccessService } from './review-history-access.service';
import type { Role } from '../../../users/domain/role';

function completedSession(
  overrides: Partial<{
    id: string;
    communityId: string;
    performedById: string;
    performedByCompanyId: string | null;
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
    performedByCompanyId: overrides.performedByCompanyId ?? null,
  });
}

function buildService(
  repository: InMemoryReviewSessionRepository,
  communityScopeChecker: FakeCommunityScopeChecker,
  companyScopeChecker: FakeCompanyScopeChecker,
): ReviewHistoryAccessService {
  return new ReviewHistoryAccessService(
    repository,
    communityScopeChecker,
    companyScopeChecker,
  );
}

// design.md Decision 7 (the 2026-09-09 reversal), tasks.md 3.7-3.10: scope
// resolution moves INSIDE each role branch — a technician makes no Layer 2
// call at all, a representative's path is unchanged, and a manager
// resolves company scope via CompanyScopeChecker, failing closed before any
// repository call.
describe('ReviewHistoryAccessService.listForActor', () => {
  let repository: InMemoryReviewSessionRepository;
  let communityScopeChecker: FakeCommunityScopeChecker;
  let companyScopeChecker: FakeCompanyScopeChecker;
  let service: ReviewHistoryAccessService;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    communityScopeChecker = new FakeCommunityScopeChecker();
    companyScopeChecker = new FakeCompanyScopeChecker();
    service = buildService(
      repository,
      communityScopeChecker,
      companyScopeChecker,
    );
  });

  // tasks.md 3.7: the technician branch reaches findCompletedForPerformer
  // and NEVER calls communityScopeChecker at all.
  it('a technician reaches findCompletedForPerformer and never calls communityScopeChecker', async () => {
    repository.seed(completedSession({ id: 'own', performedById: 'user-1' }));
    repository.seed(completedSession({ id: 'other', performedById: 'user-2' }));
    const listSpy = jest.spyOn(
      communityScopeChecker,
      'listAssignedCommunityIds',
    );

    const result = await service.listForActor({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.map((s) => s.id)).toEqual(['own']);
    expect(listSpy).not.toHaveBeenCalled();
  });

  // tasks.md 3.8: the reversal, explicitly — no active community
  // assignment (none seeded, i.e. the technician's assignment was
  // deactivated or never existed) STILL yields the technician's own
  // sessions; another performer's session is still never returned.
  it("a technician with zero active assignments still sees their own sessions, and no one else's", async () => {
    repository.seed(completedSession({ id: 'own', performedById: 'user-1' }));
    repository.seed(completedSession({ id: 'other', performedById: 'user-2' }));
    // Deliberately no communityScopeChecker.assign() call — mirrors a
    // deactivated (or never-existing) community assignment.

    const own = await service.listForActor({
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });
    const other = await service.listForActor({
      userId: 'user-2',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(own.map((s) => s.id)).toEqual(['own']);
    expect(other.map((s) => s.id)).toEqual(['other']);
  });

  // tasks.md 3.9: the representative branch is byte-identical to the
  // shipped code — active-assignment gate, empty-scope early return, both
  // unchanged.
  it('a representative sees every performer in their active community scope', async () => {
    repository.seed(
      completedSession({
        id: 'performed-by-technician',
        performedById: 'user-2',
      }),
    );
    communityScopeChecker.assign('rep-1', 'community-1');

    const result = await service.listForActor({
      userId: 'rep-1',
      role: 'COMMUNITY_REPRESENTATIVE',
    });

    expect(result.map((s) => s.id)).toEqual(['performed-by-technician']);
  });

  it('an empty community scope short-circuits to [] without a repository call (representative, unchanged)', async () => {
    const spy = jest.spyOn(repository, 'findCompletedInCommunities');

    const result = await service.listForActor({
      userId: 'rep-1',
      role: 'COMMUNITY_REPRESENTATIVE',
    });

    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  // tasks.md 3.10: manager branch — null company reaches NO repository
  // call; a resolved company id reaches exactly one call to
  // findCompletedForCompany; deactivating the manager's technicians'
  // assignments (i.e. leaving communityScopeChecker unassigned) changes
  // nothing about the manager's own result.
  it('a manager with no resolved company reaches no repository call and yields []', async () => {
    const spy = jest.spyOn(repository, 'findCompletedForCompany');

    const result = await service.listForActor({
      userId: 'manager-1',
      role: 'MAINTENANCE_COMPANY_MANAGER',
    });

    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a manager with a resolved company sees every completed session for that company, unaffected by any assignment state', async () => {
    repository.seed(
      completedSession({
        id: 'company-session',
        performedById: 'tech-1',
        performedByCompanyId: 'company-1',
      }),
    );
    repository.seed(
      completedSession({
        id: 'other-company-session',
        performedById: 'tech-2',
        performedByCompanyId: 'company-2',
      }),
    );
    companyScopeChecker.assign('manager-1', 'company-1');
    const spy = jest.spyOn(repository, 'findCompletedForCompany');
    // No community assignment seeded for tech-1/tech-2 at all — the
    // manager's scope must be unaffected by any assignment change.

    const result = await service.listForActor({
      userId: 'manager-1',
      role: 'MAINTENANCE_COMPANY_MANAGER',
    });

    expect(result.map((s) => s.id)).toEqual(['company-session']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('company-1');
  });

  it.each<Role>(['SYSTEM_ADMIN', 'MANAGER'])(
    '%s reaches no repository call and yields []',
    async (role) => {
      communityScopeChecker.assign('user-1', 'community-1');
      companyScopeChecker.assign('user-1', 'company-1');
      const performerSpy = jest.spyOn(repository, 'findCompletedForPerformer');
      const communitySpy = jest.spyOn(repository, 'findCompletedInCommunities');
      const companySpy = jest.spyOn(repository, 'findCompletedForCompany');

      const result = await service.listForActor({ userId: 'user-1', role });

      expect(result).toEqual([]);
      expect(performerSpy).not.toHaveBeenCalled();
      expect(communitySpy).not.toHaveBeenCalled();
      expect(companySpy).not.toHaveBeenCalled();
    },
  );

  it('refuses (yields []) for a role value outside the Role union', async () => {
    const result = await service.listForActor({
      userId: 'user-1',
      role: 'NOT_A_REAL_ROLE' as unknown as Role,
    });

    expect(result).toEqual([]);
  });
});

// design.md Decision 7, tasks.md 3.7-3.10: the by-id counterpart to
// listForActor — same per-branch scope resolution, same exhaustive role
// dispatch, but `null` collapses to ReviewSessionNotFoundError (ONE throw
// site, ONE mapping — mirrors SessionAccessService.loadForActor).
describe('ReviewHistoryAccessService.loadCompletedForActor', () => {
  let repository: InMemoryReviewSessionRepository;
  let communityScopeChecker: FakeCommunityScopeChecker;
  let companyScopeChecker: FakeCompanyScopeChecker;
  let service: ReviewHistoryAccessService;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    communityScopeChecker = new FakeCommunityScopeChecker();
    companyScopeChecker = new FakeCompanyScopeChecker();
    service = buildService(
      repository,
      communityScopeChecker,
      companyScopeChecker,
    );
  });

  it('a technician reads back their own completed session, even with zero active assignments', async () => {
    const session = completedSession({
      id: 'own',
      performedById: 'user-1',
      communityId: 'community-1',
    });
    repository.seed(session);
    // Deliberately no communityScopeChecker.assign() — the reversal means
    // this must still succeed.

    const result = await service.loadCompletedForActor('own', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(result.id).toBe('own');
  });

  it("a technician still gets ReviewSessionNotFoundError for another performer's session, deactivated or not", async () => {
    repository.seed(
      completedSession({ id: 'foreign', performedById: 'user-2' }),
    );

    await expect(
      service.loadCompletedForActor('foreign', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it('a representative reads back a session they did not perform', async () => {
    const session = completedSession({
      id: 'performed-by-technician',
      performedById: 'user-2',
      communityId: 'community-1',
    });
    repository.seed(session);
    communityScopeChecker.assign('rep-1', 'community-1');

    const result = await service.loadCompletedForActor(
      'performed-by-technician',
      { userId: 'rep-1', role: 'COMMUNITY_REPRESENTATIVE' },
    );

    expect(result.id).toBe('performed-by-technician');
  });

  it('a representative gets ReviewSessionNotFoundError on an empty (deactivated) community scope — unchanged', async () => {
    repository.seed(
      completedSession({ id: 'session-1', communityId: 'community-1' }),
    );

    await expect(
      service.loadCompletedForActor('session-1', {
        userId: 'rep-1',
        role: 'COMMUNITY_REPRESENTATIVE',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it('a manager reads back a session performed under their resolved company', async () => {
    const session = completedSession({
      id: 'company-session',
      performedById: 'tech-1',
      performedByCompanyId: 'company-1',
    });
    repository.seed(session);
    companyScopeChecker.assign('manager-1', 'company-1');

    const result = await service.loadCompletedForActor('company-session', {
      userId: 'manager-1',
      role: 'MAINTENANCE_COMPANY_MANAGER',
    });

    expect(result.id).toBe('company-session');
  });

  it('a manager with a null company scope reaches no repository call and gets ReviewSessionNotFoundError', async () => {
    repository.seed(
      completedSession({
        id: 'company-session',
        performedByCompanyId: 'company-1',
      }),
    );
    const spy = jest.spyOn(repository, 'findCompletedByIdForCompany');

    await expect(
      service.loadCompletedForActor('company-session', {
        userId: 'manager-1',
        role: 'MAINTENANCE_COMPANY_MANAGER',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a manager gets ReviewSessionNotFoundError for another company's session", async () => {
    repository.seed(
      completedSession({
        id: 'other-company-session',
        performedByCompanyId: 'company-2',
      }),
    );
    companyScopeChecker.assign('manager-1', 'company-1');

    await expect(
      service.loadCompletedForActor('other-company-session', {
        userId: 'manager-1',
        role: 'MAINTENANCE_COMPANY_MANAGER',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it.each<[string, () => void, string]>([
    [
      'an unknown sessionId',
      () => {
        communityScopeChecker.assign('user-1', 'community-1');
      },
      'nonexistent',
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
        communityScopeChecker.assign('user-1', 'community-1');
      },
      'foreign-community',
    ],
  ])(
    '%s collapses to ReviewSessionNotFoundError (representative)',
    async (_label, seed, sessionId) => {
      seed();

      await expect(
        service.loadCompletedForActor(sessionId, {
          userId: 'user-1',
          role: 'COMMUNITY_REPRESENTATIVE',
        }),
      ).rejects.toThrow(ReviewSessionNotFoundError);
    },
  );

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
    communityScopeChecker.assign('user-1', 'community-1');

    await expect(
      service.loadCompletedForActor('draft-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });

  it.each<Role>(['SYSTEM_ADMIN', 'MANAGER'])(
    '%s reaches no repository call and gets ReviewSessionNotFoundError',
    async (role) => {
      const session = completedSession({
        id: 'session-x',
        performedById: 'user-1',
        communityId: 'community-1',
      });
      repository.seed(session);
      communityScopeChecker.assign('user-1', 'community-1');
      companyScopeChecker.assign('user-1', 'company-1');
      const byPerformerSpy = jest.spyOn(
        repository,
        'findCompletedByIdForPerformer',
      );
      const byCommunitySpy = jest.spyOn(
        repository,
        'findCompletedByIdInCommunities',
      );
      const byCompanySpy = jest.spyOn(
        repository,
        'findCompletedByIdForCompany',
      );

      await expect(
        service.loadCompletedForActor('session-x', { userId: 'user-1', role }),
      ).rejects.toThrow(ReviewSessionNotFoundError);
      expect(byPerformerSpy).not.toHaveBeenCalled();
      expect(byCommunitySpy).not.toHaveBeenCalled();
      expect(byCompanySpy).not.toHaveBeenCalled();
    },
  );
});

// tasks.md 3.11: SessionAccessService's existing suite passes unmodified —
// proof the write-path sibling service changed nothing. This is asserted
// by simply not touching session-access.service.ts or its spec at all in
// this phase; the regression is enforced by CI running that suite
// alongside this one, not by a test in this file.
