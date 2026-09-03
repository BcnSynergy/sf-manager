import 'dotenv/config';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring
// maintenance-company-migration.integration.spec.ts /
// inspectable-element-migration.integration.spec.ts. tasks.md 9.4.
//
// design.md Decision 3: the 3 partial/compound unique indexes on
// "ReviewTemplate" have no `WHERE` equivalent in schema.prisma's `@@unique`
// DSL, so they are hand-written in migration.sql and therefore INVISIBLE to
// Prisma's migration diffing — a later `prisma migrate dev` could silently
// drop them, exactly the incident
// maintenance-company-migration.integration.spec.ts documents for its own
// hand-written index/FK. Same for the "ReviewTemplateQuestion" -> "ReviewTemplate"
// FK (no `@relation`, ADR-013).
describe('ReviewTemplate/ReviewTemplateQuestion schema (migration integration guard)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // design.md Decision 3: sole enforcement of "at most one active version
  // per (elementType, frequency) lineage".
  it('the hand-written partial unique index ReviewTemplate_one_active_per_lineage is present in pg_indexes with the expected definition', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'ReviewTemplate'
        AND indexname = 'ReviewTemplate_one_active_per_lineage'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE INDEX');
    expect(rows[0].indexdef).toContain('"elementType", frequency');
    expect(rows[0].indexdef).toContain(
      'status = \'active\'::"ReviewTemplateStatus"',
    );
  });

  // design.md Decision 3: sole enforcement of "at most one draft per
  // (elementType, frequency) lineage" — this is what structurally makes the
  // activate() concurrency race same-row-only (tasks.md 9.3's precondition).
  it('the hand-written partial unique index ReviewTemplate_one_draft_per_lineage is present in pg_indexes with the expected definition', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'ReviewTemplate'
        AND indexname = 'ReviewTemplate_one_draft_per_lineage'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE INDEX');
    expect(rows[0].indexdef).toContain(
      'status = \'draft\'::"ReviewTemplateStatus"',
    );
    expect(rows[0].indexdef).toContain('"deletedAt" IS NULL');
  });

  // design.md Decision 3: sole enforcement of "version is unique within a
  // lineage" — Postgres treats NULLs (unassigned draft versions) as
  // distinct, so this index tolerates many concurrent drafts.
  it('the hand-written compound unique index ReviewTemplate_lineage_version_key is present in pg_indexes with the expected definition', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'ReviewTemplate'
        AND indexname = 'ReviewTemplate_lineage_version_key'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE INDEX');
    expect(rows[0].indexdef).toContain('"elementType", frequency, version');
  });

  // design.md — the FK from ReviewTemplateQuestion.templateId to
  // ReviewTemplate(id) has no `@relation` in schema.prisma (ADR-013), so it
  // is equally invisible to Prisma's migration diffing.
  it('the hand-written FK ReviewTemplateQuestion_templateId_fkey is present in pg_constraint with ON DELETE RESTRICT', async () => {
    const rows = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'ReviewTemplateQuestion_templateId_fkey'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].definition).toContain('FOREIGN KEY ("templateId")');
    expect(rows[0].definition).toContain('REFERENCES "ReviewTemplate"(id)');
    expect(rows[0].definition).toContain('ON DELETE RESTRICT');
  });

  // design.md Decision 2: rows in "ReviewTemplateQuestion" exist ONLY for
  // frozen versions, and `questionText` being NOT NULL is what makes "a
  // frozen version with no snapshot wording" structurally unrepresentable —
  // not merely test-guarded at the application layer.
  it('ReviewTemplateQuestion.questionText is NOT NULL', async () => {
    const rows = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'ReviewTemplateQuestion' AND column_name = 'questionText'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('NO');
  });
});
