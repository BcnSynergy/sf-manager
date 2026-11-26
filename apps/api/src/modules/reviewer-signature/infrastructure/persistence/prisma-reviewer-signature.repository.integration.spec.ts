import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaReviewerSignatureRepository } from './prisma-reviewer-signature.repository';

// reviewer-signature: one row per user, created on the first save and
// replaced on the next, against a real Postgres (the upsert and the
// hand-written FK to User).
describe('PrismaReviewerSignatureRepository (integration, reviewer-signature)', () => {
  let prisma: PrismaService;
  let repository: PrismaReviewerSignatureRepository;
  const userIds: string[] = [];

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: `signature-${id}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'MAINTENANCE_TECHNICIAN',
      },
    });
    userIds.push(id);
    return id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaReviewerSignatureRepository(prisma);
  });

  afterAll(async () => {
    await prisma.reviewerSignature.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('finds nothing for a user who never saved a signature', async () => {
    const userId = await createUser();

    expect(await repository.findByUserId(userId)).toBeNull();
  });

  it('creates the row on the first save and replaces it on the next', async () => {
    const userId = await createUser();

    const first = await repository.save(userId, `signatures/${userId}-1.png`);
    const second = await repository.save(userId, `signatures/${userId}-2.jpg`);

    expect(first.storageKey).toBe(`signatures/${userId}-1.png`);
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(
      first.updatedAt.getTime(),
    );
    expect(await repository.findByUserId(userId)).toEqual({
      userId,
      storageKey: `signatures/${userId}-2.jpg`,
      updatedAt: second.updatedAt,
    });
    expect(await prisma.reviewerSignature.count({ where: { userId } })).toBe(1);
  });

  it("keeps each user's signature apart", async () => {
    const one = await createUser();
    const two = await createUser();

    await repository.save(one, `signatures/${one}.png`);
    await repository.save(two, `signatures/${two}.png`);

    expect((await repository.findByUserId(one))?.storageKey).toBe(
      `signatures/${one}.png`,
    );
  });

  // The migration's ON DELETE RESTRICT: users are soft-deleted (ADR-010),
  // so a hard delete of a user with a signature is refused and the
  // signature row stays.
  it('refuses to hard-delete a user who has a signature (ON DELETE RESTRICT)', async () => {
    const userId = await createUser();
    await repository.save(userId, `signatures/${userId}.png`);

    await expect(
      prisma.user.delete({ where: { id: userId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect((await repository.findByUserId(userId))?.storageKey).toBe(
      `signatures/${userId}.png`,
    );
  });

  it('refuses a signature for a user that does not exist (FK to User)', async () => {
    const missing = randomUUID();

    await expect(
      repository.save(missing, `signatures/${missing}.png`),
    ).rejects.toThrow();
  });
});
