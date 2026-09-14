import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

// Integration test against a real Postgres instance (design.md Testing
// Strategy — "Schema survival"), mirroring
// review-session-migration.integration.spec.ts /
// maintenance-company-migration.integration.spec.ts. tasks.md 1.9.
//
// design.md Decision 1: the `ManagerCapability` enum and
// `User.managerCapabilities` column are additive — no `@relation`-less FK is
// involved here, but the column itself, its enum type, and its NOT NULL
// default are all schema facts worth pinning independently of any use case
// (none reads this column yet, tasks.md 1.10), plus a regression guard that
// this migration did not silently drop any pre-existing hand-written
// FK/index.
describe('User.managerCapabilities schema (migration integration guard)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('the ManagerCapability enum type has exactly one label: VIEW_ALL_REVIEWS', async () => {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'ManagerCapability'
    `;

    expect(rows.map((r) => r.enumlabel)).toEqual(['VIEW_ALL_REVIEWS']);
  });

  it('the managerCapabilities column is NOT NULL with an empty-array default', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ is_nullable: string; column_default: string | null }>
    >`
      SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'managerCapabilities'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('NO');
    expect(rows[0].column_default).toContain('ARRAY[]::"ManagerCapability"[]');
  });

  // design.md Decision 1: NOT NULL from the start with a default covering
  // every pre-existing row — no backfill step exists, so every row (seeded
  // before or after this migration) must read `[]`, never anything else.
  // Deliberately NOT an `IS NULL` check: the column is already pinned
  // NOT NULL by the assertion above, so an `IS NULL` count can never be
  // non-zero regardless of correctness — it would pass even if a backfill
  // bug left rows with a non-empty array. This exercises the opposite of
  // `{}` instead, which actually pins the "no backfill needed, every row
  // reads `{}`" premise.
  //
  // PR 1/4 review fix (round 2): this USED TO count over the entire `User`
  // table, which Jest's parallel workers share across every integration
  // spec file — `prisma-user.repository.integration.spec.ts` grants then
  // revokes a capability on a real row within the same test run, so a
  // whole-table count could spuriously observe a non-empty array mid-grant
  // and fail (passing today, but by luck of scheduling, not by guarantee).
  // Fixed by inserting and pinning a single, isolated row of THIS test's
  // own — via raw SQL that OMITS the `managerCapabilities` column entirely,
  // so the assertion is exercising the column's own Postgres `DEFAULT`
  // expression directly, not the entity/mapper's `[]` default (see the note
  // on the sibling round-trip test above) — instead of scanning a table
  // shared with concurrently-running specs.
  it('a freshly inserted row (column omitted) reads an empty managerCapabilities array via the column DEFAULT', async () => {
    const id = randomUUID();
    const email = `managercapability-migration-guard-${randomUUID()}@example.com`;

    await prisma.$executeRaw`
      INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
      VALUES (${id}::uuid, ${email}, 'irrelevant-hash', 'SYSTEM_ADMIN'::"Role", now(), now())
    `;

    try {
      // Read back through the Prisma Client model API, not `$queryRaw` —
      // `$queryRaw` returns a Postgres enum-array column as its raw wire
      // text (e.g. the literal string `"{}"`, not `[]`), since no type
      // parser is registered for it outside Prisma's own generated
      // client. The model API is what every real caller (UserMapper /
      // PrismaUserRepository) actually goes through, so this also matches
      // production read behavior more closely than a raw SELECT would.
      const record = await prisma.user.findUniqueOrThrow({ where: { id } });

      expect(record.managerCapabilities).toEqual([]);
    } finally {
      await prisma.$executeRaw`DELETE FROM "User" WHERE id = ${id}::uuid`;
    }
  });

  // Regression guard mirroring maintenance-company-migration.integration
  // .spec.ts's own precedent: confirms this migration did not silently drop
  // any pre-existing hand-written FK/index this schema depends on.
  it('does not drop the pre-existing hand-written FKs and partial unique indexes', async () => {
    const constraintRows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'User_maintenanceCompanyId_fkey',
        'CommunityRepresentative_communityId_fkey',
        'CommunityRepresentative_userId_fkey',
        'CommunityTechnician_communityId_fkey',
        'CommunityTechnician_userId_fkey',
        'ReviewSession_performedById_fkey'
      )
    `;

    expect(constraintRows.map((r) => r.conname).sort()).toEqual(
      [
        'User_maintenanceCompanyId_fkey',
        'CommunityRepresentative_communityId_fkey',
        'CommunityRepresentative_userId_fkey',
        'CommunityTechnician_communityId_fkey',
        'CommunityTechnician_userId_fkey',
        'ReviewSession_performedById_fkey',
      ].sort(),
    );

    const indexRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'User_maintenanceCompanyId_idx',
        'ReviewSession_open_draft_key',
        'MaintenanceCompany_taxId_active_key'
      )
    `;

    expect(indexRows.map((r) => r.indexname).sort()).toEqual(
      [
        'User_maintenanceCompanyId_idx',
        'ReviewSession_open_draft_key',
        'MaintenanceCompany_taxId_active_key',
      ].sort(),
    );
  });

  // Simulated pre-migration state, per review-session-migration.integration
  // .spec.ts's precedent: a rolled-back interactive transaction so the DROP
  // is never visible to any other connection and an assertion failure rolls
  // back automatically instead of leaving the schema half-migrated. This
  // repo has no `down.sql` convention and Prisma Migrate has no down step.
  it('simulated pre-migration state: dropping the column and type is reversible within a rolled-back transaction', async () => {
    class RollbackSentinel extends Error {}

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`ALTER TABLE "User" DROP COLUMN "managerCapabilities"`;
        await tx.$executeRaw`DROP TYPE "ManagerCapability"`;

        const columnRows = await tx.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'User' AND column_name = 'managerCapabilities'
        `;
        expect(columnRows).toHaveLength(0);

        throw new RollbackSentinel();
      }),
    ).rejects.toThrow(RollbackSentinel);

    // The transaction above never committed — column and type are exactly
    // as they were before this test ran.
    const columnRows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'managerCapabilities'
    `;
    expect(columnRows).toHaveLength(1);
  });
});
