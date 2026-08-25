import { CommunityRepresentative } from '../../../domain/community-representative.entity';
import { AssignmentAlreadyExistsError } from '../../../domain/errors/assignment-already-exists.error';
import { InMemoryCommunityRepresentativeRepository } from './in-memory-community-representative.repository';

const makeRepresentative = (
  overrides: Partial<{
    id: string;
    communityId: string;
    userId: string;
    deactivatedAt: Date | null;
  }> = {},
): CommunityRepresentative =>
  new CommunityRepresentative({
    id: 'assignment-1',
    communityId: 'community-1',
    userId: 'user-1',
    deactivatedAt: null,
    ...overrides,
  });

// Test double for CommunityRepresentativeRepository (design.md Testing
// Strategy: in-memory fakes with invariant parity). This fake is the
// exclusivity/transactional seam the Phase 6 use cases exercise directly —
// pinned here at the unit level (tasks.md 6.6), same rationale as
// in-memory-user.repository.spec.ts.
describe('InMemoryCommunityRepresentativeRepository', () => {
  let repository: InMemoryCommunityRepresentativeRepository;

  beforeEach(() => {
    repository = new InMemoryCommunityRepresentativeRepository();
  });

  it('create() rejects a second row for the same (communityId, userId) pair', async () => {
    await repository.create(makeRepresentative());

    await expect(repository.create(makeRepresentative())).rejects.toThrow(
      AssignmentAlreadyExistsError,
    );
  });

  it('create() allows the same user in a different community (triangulation)', async () => {
    await repository.create(makeRepresentative());

    await expect(
      repository.create(
        makeRepresentative({ id: 'assignment-2', communityId: 'community-2' }),
      ),
    ).resolves.toBeUndefined();
  });

  it('findActiveByCommunity() returns only the active row for that community', async () => {
    await repository.create(makeRepresentative());
    await repository.create(
      makeRepresentative({
        id: 'assignment-2',
        communityId: 'community-1',
        userId: 'user-2',
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    const active = await repository.findActiveByCommunity('community-1');

    expect(active?.userId).toBe('user-1');
  });

  it('findActiveByCommunity() returns null when nobody is active (triangulation)', async () => {
    await repository.create(
      makeRepresentative({
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    expect(await repository.findActiveByCommunity('community-1')).toBeNull();
  });

  it('countActiveByUser() counts active rows across communities', async () => {
    await repository.create(
      makeRepresentative({ id: 'a1', communityId: 'c1' }),
    );
    await repository.create(
      makeRepresentative({ id: 'a2', communityId: 'c2' }),
    );
    await repository.create(
      makeRepresentative({
        id: 'a3',
        communityId: 'c3',
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    expect(await repository.countActiveByUser('user-1')).toBe(2);
  });

  it('setDeactivatedAt() updates deactivatedAt on the matching row', async () => {
    await repository.create(makeRepresentative());

    await repository.setDeactivatedAt(
      'community-1',
      'user-1',
      new Date('2026-02-01T00:00:00.000Z'),
    );

    const record = await repository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(record?.deactivatedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
  });

  it('listByCommunity() includes both active and deactivated records', async () => {
    await repository.create(makeRepresentative({ id: 'a1', userId: 'user-1' }));
    await repository.create(
      makeRepresentative({
        id: 'a2',
        userId: 'user-2',
        deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    const rows = await repository.listByCommunity('community-1');

    expect(rows.map((row) => row.userId).sort()).toEqual(['user-1', 'user-2']);
  });

  it('transactional() rolls back all mutations when the callback throws', async () => {
    await repository.create(makeRepresentative());

    await expect(
      repository.transactional(async (repo) => {
        await repo.setDeactivatedAt(
          'community-1',
          'user-1',
          new Date('2026-03-01T00:00:00.000Z'),
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const record = await repository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(record?.deactivatedAt).toBeNull();
  });

  it('transactional() commits mutations when the callback succeeds (triangulation)', async () => {
    await repository.create(makeRepresentative());

    await repository.transactional(async (repo) => {
      await repo.setDeactivatedAt(
        'community-1',
        'user-1',
        new Date('2026-03-01T00:00:00.000Z'),
      );
    });

    const record = await repository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(record?.deactivatedAt).toEqual(new Date('2026-03-01T00:00:00.000Z'));
  });
});
