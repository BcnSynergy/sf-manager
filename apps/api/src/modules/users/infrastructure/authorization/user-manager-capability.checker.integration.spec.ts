import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { User } from '../../domain/user.entity';
import { PrismaUserRepository } from '../persistence/prisma-user.repository';
import { UserManagerCapabilityChecker } from './user-manager-capability.checker';

const idGenerator = new UuidV7IdGenerator();

// TD-15: the review-schedule e2e proves that a soft-deleted granted MANAGER
// loses access only with an in-memory user repository. This runs the real
// checker over the real PrismaUserRepository against the per-run test
// database (see prisma-user.repository.integration.spec.ts), so the
// `deletedAt: null` filter the checker relies on is exercised in SQL.
describe('UserManagerCapabilityChecker over PrismaUserRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaUserRepository;
  let checker: UserManagerCapabilityChecker;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaUserRepository(prisma);
    checker = new UserManagerCapabilityChecker(repository);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('grants VIEW_ALL_REVIEWS to a granted MANAGER until the user is soft-deleted', async () => {
    const id = idGenerator.generate();
    const now = new Date();
    await repository.create(
      new User({
        id,
        email: `granted-manager-${randomUUID()}@example.com`,
        passwordHash: 'argon2id$hash',
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    );

    await expect(
      checker.hasManagerCapability(id, 'MANAGER', 'VIEW_ALL_REVIEWS'),
    ).resolves.toBe(true);

    await repository.softDeleteById(id);

    await expect(
      checker.hasManagerCapability(id, 'MANAGER', 'VIEW_ALL_REVIEWS'),
    ).resolves.toBe(false);
    // The row and its grant are still there: only the soft-delete filter
    // turns the capability off.
    const row = await prisma.user.findUnique({ where: { id } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.managerCapabilities).toEqual(['VIEW_ALL_REVIEWS']);
  });
});
