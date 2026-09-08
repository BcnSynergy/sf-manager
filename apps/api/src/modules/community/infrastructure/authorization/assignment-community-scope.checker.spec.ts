import type { Role } from '../../../users/domain/role';
import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { CommunityTechnician } from '../../domain/community-technician.entity';
import { InMemoryCommunityRepresentativeRepository } from '../../application/use-cases/testing/in-memory-community-representative.repository';
import { InMemoryCommunityTechnicianRepository } from '../../application/use-cases/testing/in-memory-community-technician.repository';
import { AssignmentCommunityScopeChecker } from './assignment-community-scope.checker';

// design.md Decision 4, Layer 2 of the 3-layer scope check. Fail-closed and
// exhaustive on Role — every one of the 5 roles is exercised against every
// one of the 3 assignment states (no row / deactivated row / active row),
// review-session tasks.md 2.4's "table-driven unit: all 5 roles x {no row,
// deactivated row, active row}". Only the two performing roles have an
// assignment kind at all; the other 3 must refuse regardless of what is
// seeded in either repository, because the checker never dispatches to a
// repository for them (fail-closed by construction, not by accident).
describe('AssignmentCommunityScopeChecker', () => {
  const communityId = 'community-1';
  const userId = 'user-1';

  type AssignmentKind = 'technician' | 'representative' | 'none';

  function buildChecker(state: {
    technician?: CommunityTechnician;
    representative?: CommunityRepresentative;
  }): AssignmentCommunityScopeChecker {
    const technicianRepo = new InMemoryCommunityTechnicianRepository();
    const representativeRepo = new InMemoryCommunityRepresentativeRepository();
    if (state.technician) {
      technicianRepo.seed(state.technician);
    }
    if (state.representative) {
      representativeRepo.seed(state.representative);
    }
    return new AssignmentCommunityScopeChecker(
      technicianRepo,
      representativeRepo,
    );
  }

  describe.each<[Role, AssignmentKind]>([
    ['MAINTENANCE_TECHNICIAN', 'technician'],
    ['COMMUNITY_REPRESENTATIVE', 'representative'],
    ['SYSTEM_ADMIN', 'none'],
    ['MANAGER', 'none'],
    ['MAINTENANCE_COMPANY_MANAGER', 'none'],
  ])('role %s', (role, kind) => {
    it('refuses when no assignment row exists', async () => {
      const checker = buildChecker({});

      await expect(
        checker.isAssignedTo(userId, role, communityId),
      ).resolves.toBe(false);
    });

    it('refuses when the assignment row is deactivated', async () => {
      const checker = buildChecker(
        kind === 'technician'
          ? {
              technician: new CommunityTechnician({
                id: 'technician-1',
                communityId,
                userId,
                deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
              }),
            }
          : kind === 'representative'
            ? {
                representative: new CommunityRepresentative({
                  id: 'representative-1',
                  communityId,
                  userId,
                  deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
                }),
              }
            : {},
      );

      await expect(
        checker.isAssignedTo(userId, role, communityId),
      ).resolves.toBe(false);
    });

    const activeStateExpectation = kind === 'none' ? false : true;
    it(`${activeStateExpectation ? 'grants' : 'refuses'} when the assignment row is active`, async () => {
      const checker = buildChecker(
        kind === 'technician'
          ? {
              technician: new CommunityTechnician({
                id: 'technician-1',
                communityId,
                userId,
                deactivatedAt: null,
              }),
            }
          : kind === 'representative'
            ? {
                representative: new CommunityRepresentative({
                  id: 'representative-1',
                  communityId,
                  userId,
                  deactivatedAt: null,
                }),
              }
            : {},
      );

      await expect(
        checker.isAssignedTo(userId, role, communityId),
      ).resolves.toBe(activeStateExpectation);
    });
  });

  // A representative's scope comes from their OWN assignment kind, never the
  // technician table — authorization spec "A representative's scope comes
  // from their own assignment kind".
  it('does not grant a representative scope from an active technician row for the same user/community', async () => {
    const checker = buildChecker({
      technician: new CommunityTechnician({
        id: 'technician-1',
        communityId,
        userId,
        deactivatedAt: null,
      }),
    });

    await expect(
      checker.isAssignedTo(userId, 'COMMUNITY_REPRESENTATIVE', communityId),
    ).resolves.toBe(false);
  });

  // tasks.md 2.8 / authorization spec "Deactivating an assignment removes
  // access on the next request": no cache — re-reading the SAME repository
  // instance after the assignment is deactivated must flip the answer on
  // the very next call.
  it('removes access on the next request once an active assignment is deactivated (no cache)', async () => {
    const technicianRepo = new InMemoryCommunityTechnicianRepository();
    const representativeRepo = new InMemoryCommunityRepresentativeRepository();
    technicianRepo.seed(
      new CommunityTechnician({
        id: 'technician-1',
        communityId,
        userId,
        deactivatedAt: null,
      }),
    );
    const checker = new AssignmentCommunityScopeChecker(
      technicianRepo,
      representativeRepo,
    );

    await expect(
      checker.isAssignedTo(userId, 'MAINTENANCE_TECHNICIAN', communityId),
    ).resolves.toBe(true);

    await technicianRepo.setDeactivatedAt(
      communityId,
      userId,
      new Date('2026-02-01T00:00:00.000Z'),
    );

    await expect(
      checker.isAssignedTo(userId, 'MAINTENANCE_TECHNICIAN', communityId),
    ).resolves.toBe(false);
  });

  // `role` originates from a JWT claim with no runtime enum validation, so
  // an out-of-union value must still fail closed at runtime even though the
  // switch is exhaustive at compile time (review finding: a missing
  // `default` branch resolved to `undefined` instead of `false` for such a
  // value).
  it('refuses (does not resolve to undefined) for a role value outside the Role union', async () => {
    const checker = buildChecker({});

    await expect(
      checker.isAssignedTo(
        userId,
        'NOT_A_REAL_ROLE' as unknown as Role,
        communityId,
      ),
    ).resolves.toBe(false);
  });

  // review-history design.md Decision 2 / tasks.md 1.3: table-driven over
  // all 5 roles x {no row, deactivated row, active rows} — deactivated rows
  // never appear, non-operational roles always resolve to `[]` without
  // reaching a repository call.
  describe('listAssignedCommunityIds', () => {
    describe.each<[Role, AssignmentKind]>([
      ['MAINTENANCE_TECHNICIAN', 'technician'],
      ['COMMUNITY_REPRESENTATIVE', 'representative'],
      ['SYSTEM_ADMIN', 'none'],
      ['MANAGER', 'none'],
      ['MAINTENANCE_COMPANY_MANAGER', 'none'],
    ])('role %s', (role, kind) => {
      it('resolves to [] when no assignment row exists', async () => {
        const checker = buildChecker({});

        await expect(
          checker.listAssignedCommunityIds(userId, role),
        ).resolves.toEqual([]);
      });

      it('excludes a deactivated assignment row', async () => {
        const checker = buildChecker(
          kind === 'technician'
            ? {
                technician: new CommunityTechnician({
                  id: 'technician-1',
                  communityId,
                  userId,
                  deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
                }),
              }
            : kind === 'representative'
              ? {
                  representative: new CommunityRepresentative({
                    id: 'representative-1',
                    communityId,
                    userId,
                    deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
                  }),
                }
              : {},
        );

        await expect(
          checker.listAssignedCommunityIds(userId, role),
        ).resolves.toEqual([]);
      });

      it(
        kind === 'none'
          ? 'stays [] even with an active row present for another kind'
          : 'includes the community for an active assignment row',
        async () => {
          const checker = buildChecker(
            kind === 'technician'
              ? {
                  technician: new CommunityTechnician({
                    id: 'technician-1',
                    communityId,
                    userId,
                    deactivatedAt: null,
                  }),
                }
              : kind === 'representative'
                ? {
                    representative: new CommunityRepresentative({
                      id: 'representative-1',
                      communityId,
                      userId,
                      deactivatedAt: null,
                    }),
                  }
                : {},
          );

          await expect(
            checker.listAssignedCommunityIds(userId, role),
          ).resolves.toEqual(kind === 'none' ? [] : [communityId]);
        },
      );
    });

    it('removes a community from the set on the next call once the assignment is deactivated (no cache)', async () => {
      const technicianRepo = new InMemoryCommunityTechnicianRepository();
      const representativeRepo =
        new InMemoryCommunityRepresentativeRepository();
      technicianRepo.seed(
        new CommunityTechnician({
          id: 'technician-1',
          communityId,
          userId,
          deactivatedAt: null,
        }),
      );
      const checker = new AssignmentCommunityScopeChecker(
        technicianRepo,
        representativeRepo,
      );

      await expect(
        checker.listAssignedCommunityIds(userId, 'MAINTENANCE_TECHNICIAN'),
      ).resolves.toEqual([communityId]);

      await technicianRepo.setDeactivatedAt(
        communityId,
        userId,
        new Date('2026-02-01T00:00:00.000Z'),
      );

      await expect(
        checker.listAssignedCommunityIds(userId, 'MAINTENANCE_TECHNICIAN'),
      ).resolves.toEqual([]);
    });

    it('refuses (resolves to []) for a role value outside the Role union', async () => {
      const checker = buildChecker({});

      await expect(
        checker.listAssignedCommunityIds(
          userId,
          'NOT_A_REAL_ROLE' as unknown as Role,
        ),
      ).resolves.toEqual([]);
    });
  });
});
