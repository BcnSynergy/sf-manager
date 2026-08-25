import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaUserRepository } from '../../../users/infrastructure/persistence/prisma-user.repository';
import { User } from '../../../users/domain/user.entity';
import { CommunityTechnician } from '../../domain/community-technician.entity';
import { AssignmentAlreadyExistsError } from '../../domain/errors/assignment-already-exists.error';
import { Community } from '../../domain/community.entity';
import { PrismaCommunityRepository } from './prisma-community.repository';
import { PrismaCommunityTechnicianRepository } from './prisma-community-technician.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring
// prisma-community-representative.repository.integration.spec.ts. tasks.md
// 9.5 — the key thing this suite proves that the representative suite
// doesn't: NO exclusivity is enforced (multiple technicians can be active
// in the same community simultaneously, and the same technician can be
// active across multiple communities).
describe('PrismaCommunityTechnicianRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaCommunityTechnicianRepository;
  let communityRepository: PrismaCommunityRepository;
  let userRepository: PrismaUserRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaCommunityTechnicianRepository(prisma);
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
        role: 'MAINTENANCE_TECHNICIAN',
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
      new CommunityTechnician({
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

  // tasks.md 9.5: create() rejects a duplicate (communityId, userId) pair
  // (design.md Decision 4 — the plain @@unique constraint).
  it('create() rejects a second row for the same (communityId, userId) pair with AssignmentAlreadyExistsError', async () => {
    const communityId = await createCommunity('duplicate-pair');
    const userId = await createUser('duplicate-pair');

    await repository.create(
      new CommunityTechnician({
        id: idGenerator.generate(),
        communityId,
        userId,
        deactivatedAt: new Date(),
      }),
    );

    await expect(
      repository.create(
        new CommunityTechnician({
          id: idGenerator.generate(),
          communityId,
          userId,
          deactivatedAt: null,
        }),
      ),
    ).rejects.toThrow(AssignmentAlreadyExistsError);
  });

  it('listByCommunity() returns both active and deactivated rows for a community', async () => {
    const communityId = await createCommunity('list-by-community');
    const activeUserId = await createUser('list-active');
    const deactivatedUserId = await createUser('list-deactivated');

    await repository.create(
      new CommunityTechnician({
        id: idGenerator.generate(),
        communityId,
        userId: activeUserId,
        deactivatedAt: null,
      }),
    );
    await repository.create(
      new CommunityTechnician({
        id: idGenerator.generate(),
        communityId,
        userId: deactivatedUserId,
        deactivatedAt: new Date(),
      }),
    );

    const listed = await repository.listByCommunity(communityId);
    const listedUserIds = listed.map((technician) => technician.userId);

    expect(listedUserIds).toContain(activeUserId);
    expect(listedUserIds).toContain(deactivatedUserId);
  });

  it('setDeactivatedAt() toggles deactivatedAt between a Date and null', async () => {
    const communityId = await createCommunity('set-deactivated');
    const userId = await createUser('set-deactivated');

    await repository.create(
      new CommunityTechnician({
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

  // The core behavioral distinction from CommunityRepresentative (tasks.md
  // 9.5, community-assignments spec.md "Multiple technicians active in the
  // same community"): unlike the representative table, there is no partial
  // unique index on (communityId) WHERE deactivatedAt IS NULL, so two
  // DIFFERENT technicians can both be active for the SAME community at
  // once, with no conflict of any kind.
  it('allows multiple technicians to be active in the same community simultaneously (no exclusivity)', async () => {
    const communityId = await createCommunity('no-exclusivity-same-community');
    const user1Id = await createUser('no-exclusivity-1');
    const user2Id = await createUser('no-exclusivity-2');

    await repository.create(
      new CommunityTechnician({
        id: idGenerator.generate(),
        communityId,
        userId: user1Id,
        deactivatedAt: null,
      }),
    );
    await repository.create(
      new CommunityTechnician({
        id: idGenerator.generate(),
        communityId,
        userId: user2Id,
        deactivatedAt: null,
      }),
    );

    const activeRows = await prisma.communityTechnician.findMany({
      where: { communityId, deactivatedAt: null },
    });
    expect(activeRows).toHaveLength(2);
  });

  // community-assignments spec.md "Same technician active across multiple
  // communities": the same technician can be active in any number of
  // communities at once, unlike a representative.
  it('allows the same technician to be active across multiple communities simultaneously (no exclusivity)', async () => {
    const community1Id = await createCommunity(
      'no-exclusivity-multi-community-1',
    );
    const community2Id = await createCommunity(
      'no-exclusivity-multi-community-2',
    );
    const userId = await createUser('no-exclusivity-multi-community');

    await repository.create(
      new CommunityTechnician({
        id: idGenerator.generate(),
        communityId: community1Id,
        userId,
        deactivatedAt: null,
      }),
    );
    await repository.create(
      new CommunityTechnician({
        id: idGenerator.generate(),
        communityId: community2Id,
        userId,
        deactivatedAt: null,
      }),
    );

    const first = await repository.findByCommunityAndUser(community1Id, userId);
    const second = await repository.findByCommunityAndUser(
      community2Id,
      userId,
    );
    expect(first?.isActive).toBe(true);
    expect(second?.isActive).toBe(true);
  });

  // Confirms this table has NO partial unique index like
  // CommunityRepresentative_one_active_per_community — the absence itself
  // is the design intent (design.md Interfaces: "the asymmetry, made
  // structural").
  it('has no exclusivity-style partial unique index on CommunityTechnician', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'CommunityTechnician'
        AND indexdef LIKE '%WHERE%'
    `;

    expect(rows).toHaveLength(0);
  });
});
