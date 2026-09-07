import { CommunityTechnician } from '../../../domain/community-technician.entity';
import { AssignmentAlreadyExistsError } from '../../../domain/errors/assignment-already-exists.error';
import { InMemoryCommunityTechnicianRepository } from './in-memory-community-technician.repository';

const makeTechnician = (
  overrides: Partial<{
    id: string;
    communityId: string;
    userId: string;
    deactivatedAt: Date | null;
  }> = {},
): CommunityTechnician =>
  new CommunityTechnician({
    id: 'assignment-1',
    communityId: 'community-1',
    userId: 'user-1',
    deactivatedAt: null,
    ...overrides,
  });

// Test double for CommunityTechnicianRepository (design.md Testing
// Strategy: in-memory fakes with invariant parity). Unlike
// InMemoryCommunityRepresentativeRepository, this fake has NO
// findActiveByCommunity/countActiveByUser/transactional() — there is no
// exclusivity invariant to enforce (tasks.md 9.4).
describe('InMemoryCommunityTechnicianRepository', () => {
  let repository: InMemoryCommunityTechnicianRepository;

  beforeEach(() => {
    repository = new InMemoryCommunityTechnicianRepository();
  });

  it('create() rejects a second row for the same (communityId, userId) pair', async () => {
    await repository.create(makeTechnician());

    await expect(repository.create(makeTechnician())).rejects.toThrow(
      AssignmentAlreadyExistsError,
    );
  });

  it('create() allows the same user in a different community (triangulation)', async () => {
    await repository.create(makeTechnician());

    await expect(
      repository.create(
        makeTechnician({ id: 'assignment-2', communityId: 'community-2' }),
      ),
    ).resolves.toBeUndefined();
  });

  it('create() allows a different user to be active in the same community (no exclusivity)', async () => {
    await repository.create(makeTechnician());

    await expect(
      repository.create(
        makeTechnician({ id: 'assignment-2', userId: 'user-2' }),
      ),
    ).resolves.toBeUndefined();

    const rows = await repository.listByCommunity('community-1');
    expect(rows.filter((row) => row.isActive)).toHaveLength(2);
  });

  it('setDeactivatedAt() updates deactivatedAt on the matching row only', async () => {
    await repository.create(makeTechnician());
    await repository.create(
      makeTechnician({ id: 'assignment-2', userId: 'user-2' }),
    );

    await repository.setDeactivatedAt(
      'community-1',
      'user-1',
      new Date('2026-02-01T00:00:00.000Z'),
    );

    const deactivated = await repository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    const untouched = await repository.findByCommunityAndUser(
      'community-1',
      'user-2',
    );
    expect(deactivated?.deactivatedAt).toEqual(
      new Date('2026-02-01T00:00:00.000Z'),
    );
    expect(untouched?.isActive).toBe(true);
  });

  it('listByCommunity() includes both active and deactivated records', async () => {
    await repository.create(makeTechnician({ id: 'a1', userId: 'user-1' }));
    await repository.create(
      makeTechnician({
        id: 'a2',
        userId: 'user-2',
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    const rows = await repository.listByCommunity('community-1');

    expect(rows.map((row) => row.userId).sort()).toEqual(['user-1', 'user-2']);
  });

  // design.md Decision 5: findActiveByUser feeds GET /review-scope's
  // listing only — filtered to deactivatedAt IS NULL, across communities.
  it('findActiveByUser() returns only active rows for that user, across communities', async () => {
    await repository.create(
      makeTechnician({ id: 'a1', communityId: 'c1', userId: 'user-1' }),
    );
    await repository.create(
      makeTechnician({ id: 'a2', communityId: 'c2', userId: 'user-1' }),
    );
    await repository.create(
      makeTechnician({
        id: 'a3',
        communityId: 'c3',
        userId: 'user-1',
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    await repository.create(
      makeTechnician({ id: 'a4', communityId: 'c1', userId: 'user-2' }),
    );

    const rows = await repository.findActiveByUser('user-1');

    expect(rows.map((row) => row.communityId).sort()).toEqual(['c1', 'c2']);
  });

  it('findActiveByUser() returns an empty list when the user has no active rows (triangulation)', async () => {
    await repository.create(
      makeTechnician({
        id: 'a1',
        userId: 'user-1',
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    expect(await repository.findActiveByUser('user-1')).toEqual([]);
  });
});
