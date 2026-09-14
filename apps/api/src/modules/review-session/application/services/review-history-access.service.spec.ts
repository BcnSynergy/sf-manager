import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from '../use-cases/testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from '../use-cases/testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from '../use-cases/testing/fake-company-scope.checker';
import { FakeManagerCapabilityChecker } from '../use-cases/testing/fake-manager-capability.checker';
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
  managerCapabilityChecker: FakeManagerCapabilityChecker,
): ReviewHistoryAccessService {
  return new ReviewHistoryAccessService(
    repository,
    communityScopeChecker,
    companyScopeChecker,
    managerCapabilityChecker,
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
  let managerCapabilityChecker: FakeManagerCapabilityChecker;
  let service: ReviewHistoryAccessService;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    communityScopeChecker = new FakeCommunityScopeChecker();
    companyScopeChecker = new FakeCompanyScopeChecker();
    managerCapabilityChecker = new FakeManagerCapabilityChecker();
    service = buildService(
      repository,
      communityScopeChecker,
      companyScopeChecker,
      managerCapabilityChecker,
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

  // design.md Decision 2/3: an ungranted MANAGER fails closed BEFORE any
  // repository call — the capability checker is consulted, answers false,
  // and NO scope checker other than managerCapabilityChecker is ever
  // touched for this role.
  it('an ungranted MANAGER reaches no repository call and yields []', async () => {
    communityScopeChecker.assign('user-1', 'community-1');
    companyScopeChecker.assign('user-1', 'company-1');
    const performerSpy = jest.spyOn(repository, 'findCompletedForPerformer');
    const communitySpy = jest.spyOn(repository, 'findCompletedInCommunities');
    const companySpy = jest.spyOn(repository, 'findCompletedForCompany');
    const adminSpy = jest.spyOn(repository, 'findCompletedAcrossInstallation');

    const result = await service.listForActor({
      userId: 'user-1',
      role: 'MANAGER',
    });

    expect(result).toEqual([]);
    expect(performerSpy).not.toHaveBeenCalled();
    expect(communitySpy).not.toHaveBeenCalled();
    expect(companySpy).not.toHaveBeenCalled();
    expect(adminSpy).not.toHaveBeenCalled();
  });

  // design.md Decision 3: a granted MANAGER reuses the SYSTEM_ADMIN read
  // VERBATIM — the same call, same method, second call site.
  it('a granted MANAGER reaches findCompletedAcrossInstallation, the SAME read as SYSTEM_ADMIN', async () => {
    repository.seed(
      completedSession({ id: 'any-company', performedById: 'tech-1' }),
    );
    managerCapabilityChecker.grant('manager-1');
    const adminSpy = jest.spyOn(repository, 'findCompletedAcrossInstallation');
    const capabilitySpy = jest.spyOn(
      managerCapabilityChecker,
      'hasManagerCapability',
    );

    const result = await service.listForActor({
      userId: 'manager-1',
      role: 'MANAGER',
    });

    expect(result.map((s) => s.id)).toEqual(['any-company']);
    expect(adminSpy).toHaveBeenCalledWith();
    expect(capabilitySpy).toHaveBeenCalledWith(
      'manager-1',
      'MANAGER',
      'VIEW_ALL_REVIEWS',
    );
  });

  // review-history-admin-scope design.md Decision 1/3, tasks.md 1.6: the
  // ONLY branch with no Layer 2 call at all — reaches
  // findCompletedAcrossInstallation with no arguments, and touches NEITHER
  // scope checker.
  it('a SYSTEM_ADMIN reaches findCompletedAcrossInstallation with no arguments and touches neither scope checker', async () => {
    repository.seed(
      completedSession({ id: 'any-company', performedById: 'tech-1' }),
    );
    const adminSpy = jest.spyOn(repository, 'findCompletedAcrossInstallation');
    const communitySpy = jest.spyOn(
      communityScopeChecker,
      'listAssignedCommunityIds',
    );
    const companySpy = jest.spyOn(companyScopeChecker, 'resolveCompanyScope');

    const result = await service.listForActor({
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(result.map((s) => s.id)).toEqual(['any-company']);
    expect(adminSpy).toHaveBeenCalledWith();
    expect(communitySpy).not.toHaveBeenCalled();
    expect(companySpy).not.toHaveBeenCalled();
  });

  it("a SYSTEM_ADMIN's result is unaffected by holding no community assignment and no company", async () => {
    repository.seed(completedSession({ id: 'session-1' }));
    // Deliberately no communityScopeChecker.assign() / companyScopeChecker.assign()
    // calls — the admin's scope must resolve from the role alone.

    const result = await service.listForActor({
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(result.map((s) => s.id)).toEqual(['session-1']);
  });

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
  let managerCapabilityChecker: FakeManagerCapabilityChecker;
  let service: ReviewHistoryAccessService;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    communityScopeChecker = new FakeCommunityScopeChecker();
    companyScopeChecker = new FakeCompanyScopeChecker();
    managerCapabilityChecker = new FakeManagerCapabilityChecker();
    service = buildService(
      repository,
      communityScopeChecker,
      companyScopeChecker,
      managerCapabilityChecker,
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

  it('an ungranted MANAGER reaches no repository call and gets ReviewSessionNotFoundError', async () => {
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
    const byCompanySpy = jest.spyOn(repository, 'findCompletedByIdForCompany');
    const byAdminSpy = jest.spyOn(
      repository,
      'findCompletedByIdAcrossInstallation',
    );

    await expect(
      service.loadCompletedForActor('session-x', {
        userId: 'user-1',
        role: 'MANAGER',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
    expect(byPerformerSpy).not.toHaveBeenCalled();
    expect(byCommunitySpy).not.toHaveBeenCalled();
    expect(byCompanySpy).not.toHaveBeenCalled();
    expect(byAdminSpy).not.toHaveBeenCalled();
  });

  // design.md Decision 3: the by-id counterpart — a granted MANAGER reuses
  // findCompletedByIdAcrossInstallation VERBATIM, the same method SYSTEM_ADMIN
  // uses.
  it('a granted MANAGER reads back any completed session by id via findCompletedByIdAcrossInstallation', async () => {
    const session = completedSession({
      id: 'any-session',
      performedById: 'tech-1',
      communityId: 'community-9',
    });
    repository.seed(session);
    managerCapabilityChecker.grant('manager-1');
    const adminByIdSpy = jest.spyOn(
      repository,
      'findCompletedByIdAcrossInstallation',
    );
    const capabilitySpy = jest.spyOn(
      managerCapabilityChecker,
      'hasManagerCapability',
    );

    const result = await service.loadCompletedForActor('any-session', {
      userId: 'manager-1',
      role: 'MANAGER',
    });

    expect(result.id).toBe('any-session');
    expect(adminByIdSpy).toHaveBeenCalledWith('any-session');
    expect(capabilitySpy).toHaveBeenCalledWith(
      'manager-1',
      'MANAGER',
      'VIEW_ALL_REVIEWS',
    );
  });

  // review-history-admin-scope design.md Decision 1/2/3, tasks.md 1.5/1.6:
  // the admin's by-id counterpart — findCompletedByIdAcrossInstallation(id),
  // no scope condition evaluated against the actor.
  it('a SYSTEM_ADMIN reads back any completed session by id via findCompletedByIdAcrossInstallation, unconditionally', async () => {
    const session = completedSession({
      id: 'any-session',
      performedById: 'tech-1',
      communityId: 'community-9',
    });
    repository.seed(session);
    const adminByIdSpy = jest.spyOn(
      repository,
      'findCompletedByIdAcrossInstallation',
    );

    const result = await service.loadCompletedForActor('any-session', {
      userId: 'admin-1',
      role: 'SYSTEM_ADMIN',
    });

    expect(result.id).toBe('any-session');
    expect(adminByIdSpy).toHaveBeenCalledWith('any-session');
  });

  it('a SYSTEM_ADMIN gets ReviewSessionNotFoundError for a draft or a nonexistent id', async () => {
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

    await expect(
      service.loadCompletedForActor('draft-1', {
        userId: 'admin-1',
        role: 'SYSTEM_ADMIN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
    await expect(
      service.loadCompletedForActor('nonexistent', {
        userId: 'admin-1',
        role: 'SYSTEM_ADMIN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });
});

// tasks.md 3.11: SessionAccessService's existing suite passes unmodified —
// proof the write-path sibling service changed nothing. This is asserted
// by simply not touching session-access.service.ts or its spec at all in
// this phase; the regression is enforced by CI running that suite
// alongside this one, not by a test in this file.
