import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real Postgres instance (design.md Testing
// Strategy — "Schema survival"), mirroring
// review-template-migration.integration.spec.ts /
// inspectable-element-migration.integration.spec.ts. tasks.md 3.3.
//
// design.md Interfaces/Contracts: 6 hand-written cross-module FKs (no
// `@relation` in schema.prisma, ADR-013), a hand-written partial unique
// index (`@@unique` has no `WHERE` clause) and a hand-written CHECK
// constraint are all INVISIBLE to Prisma's migration diffing — a later
// `prisma migrate dev` could silently drop any of them. spec.md "Review
// Records Carry No Deletion Path" additionally requires none of the three
// new tables to carry a `deletedAt` column at all.
describe('ReviewSession/ElementReviewEntry/QuestionAnswer schema (migration integration guard)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // design.md Interfaces/Contracts: sole enforcement of "at most one open
  // draft per (community, template, performer)" (spec.md "At Most One Open
  // Draft Per Community, Template and User").
  it('the hand-written partial unique index ReviewSession_open_draft_key is present in pg_indexes with the expected definition', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'ReviewSession'
        AND indexname = 'ReviewSession_open_draft_key'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE INDEX');
    expect(rows[0].indexdef).toContain(
      '"communityId", "templateId", "performedById"',
    );
    expect(rows[0].indexdef).toContain(
      'status = \'draft\'::"ReviewSessionStatus"',
    );
  });

  // design.md Decision 1: hand-written, Prisma-invisible backstop for the
  // intra-row half of the `answers XOR observations` invariant.
  it('the hand-written CHECK constraint ElementReviewEntry_observations_not_blank is present in pg_constraint', async () => {
    const rows = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'ElementReviewEntry_observations_not_blank'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].definition).toContain('CHECK');
    expect(rows[0].definition).toContain('observations');
  });

  // design.md File Changes: the 4 hand-written FKs whose referenced rows are
  // never hard-deleted (Community/ReviewTemplate/User/InspectableElement —
  // all soft-delete-only, ADR-010) keep the default ON DELETE RESTRICT.
  it.each<[string, string, string]>([
    ['ReviewSession_communityId_fkey', '"communityId"', '"Community"(id)'],
    ['ReviewSession_templateId_fkey', '"templateId"', '"ReviewTemplate"(id)'],
    ['ReviewSession_performedById_fkey', '"performedById"', '"User"(id)'],
    [
      'ElementReviewEntry_inspectableElementId_fkey',
      '"inspectableElementId"',
      '"InspectableElement"(id)',
    ],
  ])(
    'the hand-written FK %s is present in pg_constraint with ON DELETE RESTRICT',
    async (conname, column, references) => {
      const rows = await prisma.$queryRaw<Array<{ definition: string }>>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = ${conname}
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].definition).toContain(`FOREIGN KEY (${column})`);
      expect(rows[0].definition).toContain(`REFERENCES ${references}`);
      expect(rows[0].definition).toContain('ON DELETE RESTRICT');
    },
  );

  // design.md Interfaces/Contracts, `discardDraft`: the two FKs rooted at
  // ReviewSession -> ElementReviewEntry -> QuestionAnswer must cascade so a
  // discarded draft's recorded entries and answers are removed with it, not
  // orphaned (ReviewSession has NO deletedAt, so a hard delete is the only
  // removal path).
  it.each<[string, string, string]>([
    [
      'ElementReviewEntry_reviewSessionId_fkey',
      '"reviewSessionId"',
      '"ReviewSession"(id)',
    ],
    [
      'QuestionAnswer_elementReviewEntryId_fkey',
      '"elementReviewEntryId"',
      '"ElementReviewEntry"(id)',
    ],
  ])(
    'the hand-written FK %s is present in pg_constraint with ON DELETE CASCADE',
    async (conname, column, references) => {
      const rows = await prisma.$queryRaw<Array<{ definition: string }>>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = ${conname}
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].definition).toContain(`FOREIGN KEY (${column})`);
      expect(rows[0].definition).toContain(`REFERENCES ${references}`);
      expect(rows[0].definition).toContain('ON DELETE CASCADE');
    },
  );

  // spec.md "Review Records Carry No Deletion Path" — "No deletedAt exists
  // on the review tables": none of the three new tables may carry a
  // `deletedAt` column at all (ADR-010's stricter rule for review records).
  it.each(['ReviewSession', 'ElementReviewEntry', 'QuestionAnswer'])(
    '%s has no deletedAt column',
    async (tableName) => {
      const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = ${tableName} AND column_name = 'deletedAt'
      `;

      expect(rows).toHaveLength(0);
    },
  );

  // Regression guard mirroring inspectable-element-migration.integration.spec
  // .ts's own precedent: confirms this migration did not silently drop any
  // of the 12 pre-existing hand-written FKs/indexes (7 FKs + 5 indexes)
  // from earlier migrations.
  it('does not drop the pre-existing hand-written FKs and partial unique indexes', async () => {
    const constraintRows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'CommunityRepresentative_communityId_fkey',
        'CommunityRepresentative_userId_fkey',
        'CommunityTechnician_communityId_fkey',
        'CommunityTechnician_userId_fkey',
        'User_maintenanceCompanyId_fkey',
        'InspectableElement_communityId_fkey',
        'ReviewTemplateQuestion_templateId_fkey'
      )
    `;

    expect(constraintRows.map((r) => r.conname).sort()).toEqual(
      [
        'CommunityRepresentative_communityId_fkey',
        'CommunityRepresentative_userId_fkey',
        'CommunityTechnician_communityId_fkey',
        'CommunityTechnician_userId_fkey',
        'InspectableElement_communityId_fkey',
        'ReviewTemplateQuestion_templateId_fkey',
        'User_maintenanceCompanyId_fkey',
      ].sort(),
    );

    const indexRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'CommunityRepresentative_one_active_per_community',
        'MaintenanceCompany_taxId_active_key',
        'ReviewTemplate_one_active_per_lineage',
        'ReviewTemplate_one_draft_per_lineage',
        'ReviewTemplate_lineage_version_key'
      )
    `;

    expect(indexRows.map((r) => r.indexname).sort()).toEqual(
      [
        'CommunityRepresentative_one_active_per_community',
        'MaintenanceCompany_taxId_active_key',
        'ReviewTemplate_one_active_per_lineage',
        'ReviewTemplate_one_draft_per_lineage',
        'ReviewTemplate_lineage_version_key',
      ].sort(),
    );
  });

  // review-history-company-scope/design.md Decision 2 — the second migration
  // this suite guards. tasks.md 1.12.
  describe('performedByCompanyId (review-history-company-scope migration)', () => {
    it('the column, its index and its hand-written FK are present', async () => {
      const columnRows = await prisma.$queryRaw<
        Array<{ column_name: string; is_nullable: string }>
      >`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'ReviewSession' AND column_name = 'performedByCompanyId'
      `;
      expect(columnRows).toHaveLength(1);
      expect(columnRows[0].is_nullable).toBe('YES');

      const indexRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'ReviewSession'
          AND indexname = 'ReviewSession_performedByCompanyId_idx'
      `;
      expect(indexRows).toHaveLength(1);

      const fkRows = await prisma.$queryRaw<Array<{ definition: string }>>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'ReviewSession_performedByCompanyId_fkey'
      `;
      expect(fkRows).toHaveLength(1);
      expect(fkRows[0].definition).toContain(
        'FOREIGN KEY ("performedByCompanyId")',
      );
      expect(fkRows[0].definition).toContain(
        'REFERENCES "MaintenanceCompany"(id)',
      );
      expect(fkRows[0].definition).toContain('ON DELETE RESTRICT');
    });

    it('the pre-existing partial unique index and the pre-existing FKs on this table are still intact', async () => {
      const indexRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'ReviewSession' AND indexname = 'ReviewSession_open_draft_key'
      `;
      expect(indexRows).toHaveLength(1);

      const fkRows = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint
        WHERE conname IN (
          'ReviewSession_communityId_fkey',
          'ReviewSession_templateId_fkey',
          'ReviewSession_performedById_fkey'
        )
      `;
      expect(fkRows.map((r) => r.conname).sort()).toEqual(
        [
          'ReviewSession_communityId_fkey',
          'ReviewSession_templateId_fkey',
          'ReviewSession_performedById_fkey',
        ].sort(),
      );
    });

    // design.md Decision 2's non-obvious rationale: the backfill covers
    // EVERY pre-existing row, draft and completed alike — this test proves
    // the row-level effect by inserting rows directly (bypassing the
    // migration's own timing) and re-running the exact backfill UPDATE
    // statement, mirroring what the shipped migration already did once for
    // every row that existed before it ran.
    it("the backfill attributes a row to its performer's company, and leaves a company-less performer's row null", async () => {
      const companyId = idGenerator.generate();
      await prisma.maintenanceCompany.create({
        data: {
          id: companyId,
          name: `Backfill co ${randomUUID()}`,
          taxId: `tax-${randomUUID()}`,
          contactInfo: 'ops@example.com',
          deletedAt: null,
        },
      });

      const attributedUserId = idGenerator.generate();
      await prisma.user.create({
        data: {
          id: attributedUserId,
          email: `backfill-attributed-${randomUUID()}@example.com`,
          passwordHash: 'argon2id$hash',
          role: 'MAINTENANCE_TECHNICIAN',
          maintenanceCompanyId: companyId,
          deletedAt: null,
        },
      });
      const companyLessUserId = idGenerator.generate();
      await prisma.user.create({
        data: {
          id: companyLessUserId,
          email: `backfill-companyless-${randomUUID()}@example.com`,
          passwordHash: 'argon2id$hash',
          role: 'COMMUNITY_REPRESENTATIVE',
          maintenanceCompanyId: null,
          deletedAt: null,
        },
      });

      const communityId = idGenerator.generate();
      await prisma.community.create({
        data: {
          id: communityId,
          name: `Backfill community ${randomUUID()}`,
          address: 'Carrer Major 1, Girona',
          locale: 'ca',
          deletedAt: null,
        },
      });
      // Deliberately status: 'retired' with a randomized version, not
      // 'draft'/'active' — this test only needs a valid ReviewSession
      // .templateId FK target, not a real activation flow, and 'retired' is
      // unconstrained by either partial-unique "one active/draft per
      // lineage" index. Avoids racing other integration spec files that
      // share this suite's single ElementType and already own the other
      // frequency lineages (their own "no per-test isolation" comments).
      const templateId = idGenerator.generate();
      await prisma.reviewTemplate.create({
        data: {
          id: templateId,
          elementType: 'EXTINGUISHER',
          frequency: 'SEMIANNUAL',
          name: `Backfill template ${randomUUID()}`,
          version: Math.floor(Math.random() * 1_000_000_000),
          status: 'retired',
        },
      });

      // A DRAFT row, deliberately — the non-obvious part of Decision 2's
      // rationale: the backfill must NOT be filtered by status, or this
      // draft would be permanently unattributed once it later completes.
      const draftSessionId = idGenerator.generate();
      await prisma.reviewSession.create({
        data: {
          id: draftSessionId,
          communityId,
          templateId,
          performedById: attributedUserId,
          status: 'draft',
          performedByCompanyId: null,
        },
      });
      const companyLessSessionId = idGenerator.generate();
      await prisma.reviewSession.create({
        data: {
          id: companyLessSessionId,
          communityId,
          templateId,
          performedById: companyLessUserId,
          status: 'completed',
          completedAt: new Date(),
          performedByCompanyId: null,
        },
      });

      // Re-run the exact backfill UPDATE from migration.sql — proves the
      // row-level effect of the migration that already ran once for
      // pre-existing rows, against these freshly inserted ones.
      await prisma.$executeRaw`
        UPDATE "ReviewSession" rs
           SET "performedByCompanyId" = u."maintenanceCompanyId"
          FROM "User" u
         WHERE u."id" = rs."performedById"
           AND rs."performedByCompanyId" IS NULL
           AND rs."id" IN (${draftSessionId}::uuid, ${companyLessSessionId}::uuid)
      `;

      const draftRow = await prisma.reviewSession.findUnique({
        where: { id: draftSessionId },
        select: { performedByCompanyId: true, status: true },
      });
      expect(draftRow?.status).toBe('draft');
      expect(draftRow?.performedByCompanyId).toBe(companyId);

      const companyLessRow = await prisma.reviewSession.findUnique({
        where: { id: companyLessSessionId },
        select: { performedByCompanyId: true },
      });
      expect(companyLessRow?.performedByCompanyId).toBeNull();
    });

    // Fresh-context review finding F3: the test above re-runs a hand-copied
    // UPDATE, which proves "an UPDATE without a status filter behaves
    // correctly" but not "the UPDATE actually shipped in migration.sql has no
    // status filter" — those could drift apart. Read the real file.
    it('the shipped migration.sql backfill UPDATE has no status filter', () => {
      const migrationSql = readFileSync(
        join(
          __dirname,
          '../../../../../prisma/migrations/20260909090000_add_review_session_performed_by_company/migration.sql',
        ),
        'utf-8',
      );

      const updateStatement = migrationSql
        .slice(migrationSql.indexOf('UPDATE "ReviewSession"'))
        .split(';')[0];

      expect(updateStatement).toContain('"performedByCompanyId" IS NULL');
      expect(updateStatement).not.toMatch(/status/i);
    });

    it('the down-migration drops the FK, index and column cleanly', async () => {
      // Fresh-context review finding F1: the drop and the re-apply used to be
      // two separate committed transactions — a failed assertion in between
      // left the shared dev database permanently missing the column/index/FK,
      // and any other integration spec file running concurrently against the
      // same database could observe the column mid-drop (reproduced as a
      // flake in review-session-attribution-write-path.integration.spec.ts).
      // Postgres DDL is transactional, so running the whole drop-assert
      // sequence inside one interactive transaction that always rolls back
      // makes both problems structurally impossible: the DROP is never
      // visible to any other connection, and an assertion failure rolls back
      // automatically instead of leaving the schema half-migrated.
      class RollbackSentinel extends Error {}

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`ALTER TABLE "ReviewSession" DROP CONSTRAINT "ReviewSession_performedByCompanyId_fkey"`;
          await tx.$executeRaw`DROP INDEX "ReviewSession_performedByCompanyId_idx"`;
          await tx.$executeRaw`ALTER TABLE "ReviewSession" DROP COLUMN "performedByCompanyId"`;

          const columnRows = await tx.$queryRaw<Array<{ column_name: string }>>`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'ReviewSession' AND column_name = 'performedByCompanyId'
          `;
          expect(columnRows).toHaveLength(0);

          throw new RollbackSentinel();
        }),
      ).rejects.toThrow(RollbackSentinel);

      // The transaction above never committed — column, index and FK are
      // exactly as they were before this test ran, whether the in-transaction
      // assertion passed or failed.
      const columnRows = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ReviewSession' AND column_name = 'performedByCompanyId'
      `;
      expect(columnRows).toHaveLength(1);
    });
  });
});
