import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaUserRepository } from '../../../users/infrastructure/persistence/prisma-user.repository';
import { User } from '../../../users/domain/user.entity';
import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { AssignmentAlreadyExistsError } from '../../domain/errors/assignment-already-exists.error';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict.error';
import { Community } from '../../domain/community.entity';
import { PrismaCommunityRepository } from './prisma-community.repository';
import { PrismaCommunityRepresentativeRepository } from './prisma-community-representative.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring prisma-user.repository.integration.spec.ts /
// prisma-community.repository.integration.spec.ts. tasks.md 8.2 (pulled
// forward into PR 7 to fix the DI-bootstrap defect — see tasks.md Phase 7/8
// note).
describe('PrismaCommunityRepresentativeRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaCommunityRepresentativeRepository;
  let communityRepository: PrismaCommunityRepository;
  let userRepository: PrismaUserRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaCommunityRepresentativeRepository(prisma);
    communityRepository = new PrismaCommunityRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const uniqueName = (label: string) => `${label}-${randomUUID()}`;

  const createCommunity = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await communityRepository.create(
      new Community({
        id,
        name: uniqueName(label),
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: null,
      }),
    );
    return id;
  };

  const createUser = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await userRepository.create(
      new User({
        id,
        email: `${uniqueName(label)}@example.com`,
        passwordHash: 'argon2id$hash',
        role: 'COMMUNITY_REPRESENTATIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    return id;
  };

  it('create() then findByCommunityAndUser() round-trips an active assignment', async () => {
    const communityId = await createCommunity('round-trip');
    const userId = await createUser('round-trip');

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId,
        deactivatedAt: null,
      }),
    );

    const found = await repository.findByCommunityAndUser(communityId, userId);

    expect(found).not.toBeNull();
    expect(found?.communityId).toBe(communityId);
    expect(found?.userId).toBe(userId);
    expect(found?.isActive).toBe(true);
  });

  // tasks.md 8.1: create() rejects a duplicate (communityId, userId) pair
  // (design.md Decision 4 — P2002 on the plain @@unique -> AssignmentAlreadyExistsError,
  // distinct from the partial-index P2002 -> TransactionConflictError below).
  it('create() rejects a second row for the same (communityId, userId) pair with AssignmentAlreadyExistsError', async () => {
    const communityId = await createCommunity('duplicate-pair');
    const userId = await createUser('duplicate-pair');

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId,
        deactivatedAt: new Date(),
      }),
    );

    await expect(
      repository.create(
        new CommunityRepresentative({
          id: idGenerator.generate(),
          communityId,
          userId,
          deactivatedAt: null,
        }),
      ),
    ).rejects.toThrow(AssignmentAlreadyExistsError);
  });

  it('findActiveByCommunity() returns only the row with deactivatedAt null, and null when none is active', async () => {
    const communityId = await createCommunity('find-active');
    const activeUserId = await createUser('find-active-active');
    const inactiveUserId = await createUser('find-active-inactive');

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId: inactiveUserId,
        deactivatedAt: new Date(),
      }),
    );

    expect(await repository.findActiveByCommunity(communityId)).toBeNull();

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId: activeUserId,
        deactivatedAt: null,
      }),
    );

    const active = await repository.findActiveByCommunity(communityId);
    expect(active?.userId).toBe(activeUserId);
  });

  it('listByCommunity() returns both active and deactivated rows for a community', async () => {
    const communityId = await createCommunity('list-by-community');
    const activeUserId = await createUser('list-active');
    const deactivatedUserId = await createUser('list-deactivated');

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId: activeUserId,
        deactivatedAt: null,
      }),
    );
    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId: deactivatedUserId,
        deactivatedAt: new Date(),
      }),
    );

    const listed = await repository.listByCommunity(communityId);
    const listedUserIds = listed.map((representative) => representative.userId);

    expect(listedUserIds).toContain(activeUserId);
    expect(listedUserIds).toContain(deactivatedUserId);
  });

  it('countActiveByUser() counts only active rows across communities for a given user', async () => {
    const communityAId = await createCommunity('count-active-a');
    const communityBId = await createCommunity('count-active-b');
    const communityCId = await createCommunity('count-active-c');
    const userId = await createUser('count-active');

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId: communityAId,
        userId,
        deactivatedAt: null,
      }),
    );
    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId: communityBId,
        userId,
        deactivatedAt: null,
      }),
    );
    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId: communityCId,
        userId,
        deactivatedAt: new Date(),
      }),
    );

    expect(await repository.countActiveByUser(userId)).toBe(2);
  });

  it('setDeactivatedAt() toggles deactivatedAt between a Date and null', async () => {
    const communityId = await createCommunity('set-deactivated');
    const userId = await createUser('set-deactivated');

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId,
        deactivatedAt: null,
      }),
    );

    await repository.setDeactivatedAt(communityId, userId, new Date());
    const deactivated = await repository.findByCommunityAndUser(
      communityId,
      userId,
    );
    expect(deactivated?.isActive).toBe(false);

    await repository.setDeactivatedAt(communityId, userId, null);
    const reactivated = await repository.findByCommunityAndUser(
      communityId,
      userId,
    );
    expect(reactivated?.isActive).toBe(true);
  });

  // design.md Decision 2 Gotcha: the hand-written partial unique index is
  // invisible to schema.prisma, so a later `prisma migrate dev` could
  // silently drop it. This asserts it is still present in `pg_indexes`.
  it('the hand-written partial unique index CommunityRepresentative_one_active_per_community is still present in pg_indexes', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'CommunityRepresentative'
        AND indexname = 'CommunityRepresentative_one_active_per_community'
    `;

    expect(rows).toHaveLength(1);
  });

  // design.md Decision 2 / Testing Strategy: two concurrent transactional()
  // activations targeting the SAME community must not both commit an active
  // row — SERIALIZABLE (P2034) or the partial-index backstop (P2002) must
  // abort one of them, mapped to TransactionConflictError.
  //
  // Fresh-context review (2nd pass) Bug 2: the previous version of this test
  // fired both activate() calls via Promise.allSettled and just hoped they'd
  // race, but empirically (8 runs) they never did — the second transaction's
  // read consistently observed the first's already-committed write (no
  // incumbent -> incumbent exists), so both swapped sequentially with no
  // real conflict, and the assertions only checked rejection TYPE *if* one
  // happened, which is vacuously true when zero rejections occur.
  //
  // The `users` module's equivalent test
  // (prisma-user.repository.integration.spec.ts, "two concurrent
  // transactions each demoting one of the last two admins") guarantees a
  // genuine conflict by having both transactions WRITE to two DISJOINT rows
  // (admin1, admin2) while both READ the same overlapping predicate
  // (countActiveByRole) — a classic write-skew shape SERIALIZABLE is
  // guaranteed to catch, with no artificial synchronization needed, because
  // disjoint writes never block each other so both naturally overlap.
  //
  // This table's exclusivity invariant has no disjoint pair of rows to
  // write to independently (there is only ONE active "slot" per community,
  // by design) — any two concurrent writers necessarily target that same
  // slot. So instead of relying on incidental timing, this test uses an
  // explicit barrier: both transactions MUST complete their initial read of
  // the community's incumbent before EITHER is allowed to proceed to write.
  // This deterministically forces genuine overlap regardless of connection
  // pool/event-loop scheduling, guaranteeing both observe the SAME
  // "no incumbent" state and then race to claim the single active slot —
  // exactly one create() commits, the other hits the partial index's P2002
  // (mapped to TransactionConflictError by create()'s fix above).
  it('two concurrent transactional() activations for the same community leave exactly one active representative', async () => {
    const communityId = await createCommunity('concurrent-activation');
    const user1Id = await createUser('concurrent-activation-1');
    const user2Id = await createUser('concurrent-activation-2');

    let readsCompleted = 0;
    let releaseBarrier!: () => void;
    const bothReadsComplete = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });

    const activate = (userId: string) =>
      repository.transactional(async (repo) => {
        const incumbent = await repo.findActiveByCommunity(communityId);

        readsCompleted += 1;
        if (readsCompleted === 2) {
          releaseBarrier();
        }
        // Neither transaction may proceed to write until BOTH have
        // completed their read — guarantees genuine overlap.
        await bothReadsComplete;

        if (incumbent) {
          await repo.setDeactivatedAt(
            communityId,
            incumbent.userId,
            new Date(),
          );
        }
        await repo.create(
          new CommunityRepresentative({
            id: idGenerator.generate(),
            communityId,
            userId,
            deactivatedAt: null,
          }),
        );
      });

    const results = await Promise.allSettled([
      activate(user1Id),
      activate(user2Id),
    ]);

    const isFulfilled = <T>(
      result: PromiseSettledResult<T>,
    ): result is PromiseFulfilledResult<T> => result.status === 'fulfilled';
    const isRejected = <T>(
      result: PromiseSettledResult<T>,
    ): result is PromiseRejectedResult => result.status === 'rejected';

    const fulfilled = results.filter(isFulfilled);
    const rejected = results.filter(isRejected);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(TransactionConflictError);

    const activeRows = await prisma.communityRepresentative.findMany({
      where: { communityId, deactivatedAt: null },
    });
    expect(activeRows).toHaveLength(1);
  });

  // Fresh-context review (2nd pass) Bug 1: the hand-written partial index
  // (`CommunityRepresentative_one_active_per_community`) is INVISIBLE to
  // schema.prisma, so Prisma's classic `error.meta.target` field is never
  // populated for it — but Prisma 7's pg driver adapter (@prisma/adapter-pg)
  // surfaces the violated constraint's columns under
  // `error.meta.driverAdapterError.cause.constraint.fields` for BOTH known
  // and unknown-to-schema constraints (verified empirically against real
  // Postgres). This forces a genuine P2002 on the partial index specifically
  // (two active rows for the SAME community, DIFFERENT users — not a
  // duplicate pair) and asserts it maps to TransactionConflictError, not
  // AssignmentAlreadyExistsError.
  it('create() rejects a second ACTIVE representative for the same community (different user) with TransactionConflictError, not AssignmentAlreadyExistsError', async () => {
    const communityId = await createCommunity('partial-index-conflict');
    const user1Id = await createUser('partial-index-conflict-1');
    const user2Id = await createUser('partial-index-conflict-2');

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId: user1Id,
        deactivatedAt: null,
      }),
    );

    await expect(
      repository.create(
        new CommunityRepresentative({
          id: idGenerator.generate(),
          communityId,
          userId: user2Id,
          deactivatedAt: null,
        }),
      ),
    ).rejects.toThrow(TransactionConflictError);
  });

  // Fresh-context review (2nd pass) Bug 1: setDeactivatedAt() had NO
  // fallback branch for the plain-pair case at all, and its ONLY existing
  // branch (the partial-index check) was itself broken the same way as
  // create()'s. Reactivating (deactivatedAt: null) a representative while
  // another is already active for the community must hit the partial index
  // and map to TransactionConflictError, not leak the raw
  // PrismaClientKnownRequestError past the infrastructure layer.
  it('setDeactivatedAt() reactivating a representative rejects with TransactionConflictError when another is already active for the community', async () => {
    const communityId = await createCommunity('reactivate-conflict');
    const activeUserId = await createUser('reactivate-conflict-active');
    const inactiveUserId = await createUser('reactivate-conflict-inactive');

    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId: activeUserId,
        deactivatedAt: null,
      }),
    );
    await repository.create(
      new CommunityRepresentative({
        id: idGenerator.generate(),
        communityId,
        userId: inactiveUserId,
        deactivatedAt: new Date(),
      }),
    );

    await expect(
      repository.setDeactivatedAt(communityId, inactiveUserId, null),
    ).rejects.toThrow(TransactionConflictError);
  });
});
