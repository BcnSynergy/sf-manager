import 'dotenv/config';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

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
  // of the 9 pre-existing hand-written FKs/indexes from earlier migrations
  // (design.md "the now-9 pre-existing hand-written objects").
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
});
