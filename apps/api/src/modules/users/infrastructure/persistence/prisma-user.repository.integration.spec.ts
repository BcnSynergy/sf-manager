import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { assertSystemAdminRemains } from '../../domain/last-admin.policy';
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
  // Mirrors prisma-maintenance-company-lookup.repository.integration.spec.ts
  // -- a distinct helper so a MaintenanceCompany.taxId fixture never looks
  // like an email column value.
  const uniqueTaxId = (label: string) => `${label}-${randomUUID()}`;

  it('excludes a soft-deleted user from findByEmail (ADR-010 default filter)', async () => {
    const email = uniqueEmail('soft-deleted');
    const user = new User({
      id: idGenerator.generate(),
      email,
      passwordHash: 'argon2id$hash',
      role: 'MANAGER',
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
      role: 'MANAGER',
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
        role: 'MANAGER',
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
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    const secondSave = await repository.findByEmail(email);

    expect(secondSave?.id).toBe(originalId);
    expect(secondSave?.passwordHash).toBe('argon2id$hash-v2');
  });

  // tasks.md 6.2: create() is a plain insert (design.md Decision 8) — a
  // duplicate email MUST be rejected, never silently upserted like save().
  it('create() rejects a duplicate email without upserting the existing row', async () => {
    const email = uniqueEmail('create-duplicate');
    const originalId = idGenerator.generate();

    await repository.create(
      new User({
        id: originalId,
        email,
        passwordHash: 'argon2id$hash-original',
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    await expect(
      repository.create(
        new User({
          id: idGenerator.generate(),
          email,
          passwordHash: 'argon2id$hash-attacker',
          role: 'SYSTEM_ADMIN',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
      ),
    ).rejects.toThrow(EmailAlreadyInUseError);

    const stillOriginal = await repository.findByEmail(email);
    expect(stillOriginal?.id).toBe(originalId);
    expect(stillOriginal?.passwordHash).toBe('argon2id$hash-original');
    expect(stillOriginal?.role).toBe('MANAGER');
  });

  // tasks.md 6.4: findAll() excludes soft-deleted users by default
  // (design.md Decision 10), mirroring the existing findByEmail default
  // filter test above.
  it('findAll() excludes soft-deleted users', async () => {
    const activeEmail = uniqueEmail('find-all-active');
    const deletedEmail = uniqueEmail('find-all-deleted');
    const activeId = idGenerator.generate();

    await repository.create(
      new User({
        id: activeId,
        email: activeEmail,
        passwordHash: 'argon2id$hash',
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    await repository.create(
      new User({
        id: idGenerator.generate(),
        email: deletedEmail,
        passwordHash: 'argon2id$hash',
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      }),
    );

    const found = await repository.findAll();
    const foundIds = found.map((user) => user.id);

    expect(foundIds).toContain(activeId);
    expect(found.some((user) => user.email === deletedEmail)).toBe(false);
  });

  it('findById() and updateById() round-trip an email/role change', async () => {
    const email = uniqueEmail('update-by-id');
    const id = idGenerator.generate();

    await repository.create(
      new User({
        id,
        email,
        passwordHash: 'argon2id$hash',
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    const newEmail = uniqueEmail('update-by-id-new');
    await repository.updateById(id, {
      email: newEmail,
      role: 'MAINTENANCE_TECHNICIAN',
    });

    const updated = await repository.findById(id);
    expect(updated?.email).toBe(newEmail);
    expect(updated?.role).toBe('MAINTENANCE_TECHNICIAN');
  });

  // maintenance-company design.md File Changes: updateById's changes type
  // gains maintenanceCompanyId — a PATCH that supplies it must round-trip.
  it('findById() and updateById() round-trip a maintenanceCompanyId change', async () => {
    const email = uniqueEmail('update-by-id-company');
    const id = idGenerator.generate();
    const companyId = idGenerator.generate();

    await prisma.maintenanceCompany.create({
      data: {
        id: companyId,
        name: 'Update-By-Id Maintenance Co',
        taxId: uniqueTaxId('update-by-id-taxid'),
        contactInfo: 'ops@update-by-id.example',
        deletedAt: null,
      },
    });

    await repository.create(
      new User({
        id,
        email,
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    await repository.updateById(id, { maintenanceCompanyId: companyId });

    const updated = await repository.findById(id);
    expect(updated?.maintenanceCompanyId).toBe(companyId);
  });

  it('softDeleteById() sets deletedAt so the user is excluded from findById()', async () => {
    const email = uniqueEmail('soft-delete-by-id');
    const id = idGenerator.generate();

    await repository.create(
      new User({
        id,
        email,
        passwordHash: 'argon2id$hash',
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    await repository.softDeleteById(id);

    expect(await repository.findById(id)).toBeNull();
  });

  // tasks.md 6.3 (part 1): countActiveByRole excludes soft-deleted users.
  it('countActiveByRole() excludes soft-deleted users', async () => {
    const activeId = idGenerator.generate();
    const deletedId = idGenerator.generate();

    await repository.create(
      new User({
        id: activeId,
        email: uniqueEmail('count-active'),
        passwordHash: 'argon2id$hash',
        role: 'COMMUNITY_REPRESENTATIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    await repository.create(
      new User({
        id: deletedId,
        email: uniqueEmail('count-deleted'),
        passwordHash: 'argon2id$hash',
        role: 'COMMUNITY_REPRESENTATIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      }),
    );

    const before = await repository.countActiveByRole(
      'COMMUNITY_REPRESENTATIVE',
    );
    await repository.softDeleteById(activeId);
    const after = await repository.countActiveByRole(
      'COMMUNITY_REPRESENTATIVE',
    );

    expect(after).toBe(before - 1);
  });

  // maintenance-company design.md Decision 4: mirrors the countActiveByRole
  // test above. withDefaultFilter (deletedAt: null) is what makes
  // "soft-deleted users do not block a company's deletion" true for free.
  it('countActiveByMaintenanceCompany() excludes soft-deleted users', async () => {
    const companyId = idGenerator.generate();
    await prisma.maintenanceCompany.create({
      data: {
        id: companyId,
        name: 'Count Maintenance Co',
        taxId: uniqueTaxId('count-company-taxid'),
        contactInfo: 'ops@count-company.example',
        deletedAt: null,
      },
    });

    const activeId = idGenerator.generate();
    const alreadyDeletedId = idGenerator.generate();

    await repository.create(
      new User({
        id: activeId,
        email: uniqueEmail('count-company-active'),
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        maintenanceCompanyId: companyId,
      }),
    );
    await repository.create(
      new User({
        id: alreadyDeletedId,
        email: uniqueEmail('count-company-deleted'),
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
        maintenanceCompanyId: companyId,
      }),
    );

    const before = await repository.countActiveByMaintenanceCompany(companyId);
    await repository.softDeleteById(activeId);
    const after = await repository.countActiveByMaintenanceCompany(companyId);

    expect(after).toBe(before - 1);
  });

  // tasks.md 6.3 (part 2): two concurrent SERIALIZABLE transactions each
  // demoting one of the last two active SYSTEM_ADMIN users -> Postgres SSI
  // must abort exactly one on a P2034 write-skew conflict (design.md
  // Decision 3), which PrismaUserRepository.transactional() maps to
  // TransactionConflictError. Exactly one demotion commits; the other is
  // rejected (either by the SSI abort itself, or by
  // assertSystemAdminRemains seeing the post-abort recount) and at least
  // one SYSTEM_ADMIN always remains.
  it('two concurrent transactions each demoting one of the last two admins -> exactly one commits', async () => {
    // This suite reuses the app's own dev database (see file header) with
    // no per-test isolation, so other active SYSTEM_ADMIN rows may already
    // exist (the seeded admin from prisma/seed.ts, or admins left behind by
    // earlier test runs). countActiveByRole('SYSTEM_ADMIN') is a GLOBAL
    // count, so the "exactly one commits" assertion below is only
    // meaningful if these two freshly created admins are the ONLY active
    // ones — deactivate every pre-existing active SYSTEM_ADMIN first so the
    // invariant under test ("zero admins left") is actually reachable.
    const preExistingAdmins = (await repository.findAll()).filter(
      (user) => user.role === 'SYSTEM_ADMIN',
    );
    for (const admin of preExistingAdmins) {
      await repository.softDeleteById(admin.id);
    }

    const admin1Id = idGenerator.generate();
    const admin2Id = idGenerator.generate();

    await repository.create(
      new User({
        id: admin1Id,
        email: uniqueEmail('last-admin-1'),
        passwordHash: 'argon2id$hash',
        role: 'SYSTEM_ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    await repository.create(
      new User({
        id: admin2Id,
        email: uniqueEmail('last-admin-2'),
        passwordHash: 'argon2id$hash',
        role: 'SYSTEM_ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    // Mirrors UpdateUserUseCase's transactional demote-and-recheck pattern
    // (application/use-cases/update-user.use-case.ts) directly against the
    // repository, so this test exercises the real infrastructure isolation
    // guarantee rather than the in-memory fake's inline passthrough.
    const demote = (id: string) =>
      repository.transactional(async (repo) => {
        await repo.updateById(id, { role: 'MANAGER' });
        const remainingAdmins = await repo.countActiveByRole('SYSTEM_ADMIN');
        assertSystemAdminRemains(remainingAdmins);
      });

    const results = await Promise.allSettled([
      demote(admin1Id),
      demote(admin2Id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const remainingAdmins = await repository.countActiveByRole('SYSTEM_ADMIN');
    expect(remainingAdmins).toBe(1);
  });
});
