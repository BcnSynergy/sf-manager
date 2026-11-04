import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { assertSystemAdminRemains } from '../../domain/last-admin.policy';
import { User } from '../../domain/user.entity';
import { PrismaUserRepository } from './prisma-user.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real Postgres 18 instance. Since
// hermetic-integration-tests, `npm run test:integration` runs this against a
// fresh, uniquely named, per-run database (`sf_manager_test_<id>`), created
// and fully migrated by the harness (`globalSetup`) before any spec runs —
// not the shared dev database. Live-data checks are possible now that each
// run is hermetic, but this suite still only asserts against rows it
// creates itself, which was already the right pattern for a repository
// test.
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

  // review-history-manager-capability/design.md Decision 1/Testing Strategy:
  // column round-trip against a real Postgres instance, tasks.md 1.8.
  it('findById() and updateById() round-trip an empty and a non-empty managerCapabilities array', async () => {
    const email = uniqueEmail('update-by-id-capabilities');
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

    await repository.updateById(id, {
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });
    const granted = await repository.findById(id);
    expect(granted?.managerCapabilities).toEqual(['VIEW_ALL_REVIEWS']);

    await repository.updateById(id, { managerCapabilities: [] });
    const revoked = await repository.findById(id);
    expect(revoked?.managerCapabilities).toEqual([]);
  });

  // NOTE what this pins and what it does NOT: `repository.create()` goes
  // through `UserMapper.toPersistence()`, which always emits an explicit
  // `managerCapabilities: []` for an entity built with no value supplied
  // (the entity's own default, design.md Decision 1's "class field defaults
  // to `[]`") — so this round-trips the ENTITY default through the MAPPER,
  // it never exercises the Postgres column's own `DEFAULT` expression (an
  // `INSERT` that omits the column entirely). The column-level default is
  // pinned for real by `user-manager-capability-migration.integration.spec
  // .ts`'s `information_schema.columns.column_default` assertion.
  it('round-trips the entity/mapper default of an empty managerCapabilities array for a newly created user', async () => {
    const email = uniqueEmail('default-empty-capabilities');
    const id = idGenerator.generate();

    await repository.create(
      new User({
        id,
        email,
        passwordHash: 'argon2id$hash',
        role: 'SYSTEM_ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    const found = await repository.findById(id);
    expect(found?.managerCapabilities).toEqual([]);
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
  //
  // countActiveByRole() is a GLOBAL count, and other spec files create
  // MANAGER rows too (e.g. user-manager-capability.checker.integration.spec.ts),
  // so a before/after delta read on the root client would only hold while
  // nothing else writes that role between the two reads — i.e. only because
  // `test:integration` happens to run `--runInBand` (EN-144). Both reads and
  // the soft-delete therefore run inside one transactional() call
  // (SERIALIZABLE): every read sees the same snapshot plus this
  // transaction's own write, so a MANAGER committed by a concurrent worker
  // cannot shift the delta. A plain concurrent insert does not abort it; only
  // a concurrent serializable transaction forming a read/write cycle with it
  // can, raising TransactionConflictError instead of a wrong count (EN-145).
  it('countActiveByRole() excludes soft-deleted users', async () => {
    const activeId = idGenerator.generate();
    const deletedId = idGenerator.generate();

    await repository.create(
      new User({
        id: activeId,
        email: uniqueEmail('count-active'),
        passwordHash: 'argon2id$hash',
        role: 'MANAGER',
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
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      }),
    );

    const { before, after } = await repository.transactional(async (repo) => {
      const countBefore = await repo.countActiveByRole('MANAGER');
      await repo.softDeleteById(activeId);
      const countAfter = await repo.countActiveByRole('MANAGER');
      return { before: countBefore, after: countAfter };
    });

    expect(after).toBe(before - 1);
    // The counts above are read inside the transaction; this checks the
    // committed soft-delete through the root client without a global count.
    expect(await repository.findById(activeId)).toBeNull();
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
