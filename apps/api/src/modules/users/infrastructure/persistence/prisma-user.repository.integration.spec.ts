import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { User } from '../../domain/user.entity';
import { PrismaUserRepository } from './prisma-user.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real (test) Postgres 18 instance (design.md
// Testing Strategy). Assumes the database DATABASE_URL points at is already
// migrated via the actual migration from PR 1
// (20260821202334_add_user_and_revoked_token) — no dedicated test-database
// mechanism exists yet in this repo (single docker-compose Postgres
// instance + DATABASE_URL), so this suite reuses the same connection the
// app itself uses, exactly like `prisma migrate deploy` assumes an
// already-provisioned target database.
describe('PrismaUserRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaUserRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaUserRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Unique per test run so repeated runs never collide on the unique
  // `email` constraint, and so tests don't depend on cross-run cleanup.
  const uniqueEmail = (label: string) => `${label}-${randomUUID()}@example.com`;

  it('excludes a soft-deleted user from findByEmail (ADR-010 default filter)', async () => {
    const email = uniqueEmail('soft-deleted');
    const user = new User({
      id: idGenerator.generate(),
      email,
      passwordHash: 'argon2id$hash',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    });

    await repository.save(user);

    const found = await repository.findByEmail(email);

    expect(found).toBeNull();
  });

  it('finds an active (non-deleted) user by email', async () => {
    const email = uniqueEmail('active');
    const user = new User({
      id: idGenerator.generate(),
      email,
      passwordHash: 'argon2id$hash',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await repository.save(user);

    const found = await repository.findByEmail(email);

    expect(found).not.toBeNull();
    expect(found?.email).toBe(email);
    expect(found?.passwordHash).toBe('argon2id$hash');
  });

  it('updates the existing row (not a duplicate insert) and preserves its id on a second save() with the same email', async () => {
    const email = uniqueEmail('upsert');
    const originalId = idGenerator.generate();

    await repository.save(
      new User({
        id: originalId,
        email,
        passwordHash: 'argon2id$hash-v1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    const firstSave = await repository.findByEmail(email);
    expect(firstSave?.id).toBe(originalId);

    // A fresh id, as a caller like seed.ts would generate on every run —
    // must NOT overwrite the original identity (design.md Decision 9 /
    // Interfaces/Contracts).
    await repository.save(
      new User({
        id: idGenerator.generate(),
        email,
        passwordHash: 'argon2id$hash-v2',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    const secondSave = await repository.findByEmail(email);

    expect(secondSave?.id).toBe(originalId);
    expect(secondSave?.passwordHash).toBe('argon2id$hash-v2');
  });
});
