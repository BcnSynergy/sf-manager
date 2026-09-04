import 'dotenv/config';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

// Integration test against a real Postgres instance (design.md Testing
// Strategy), mirroring maintenance-company-migration.integration.spec.ts.
// Confirms the hand-written, `@relation`-less FK (ADR-013) and its
// Prisma-visible index survive, and that the pre-existing five
// `@relation`-less FKs this migration's own comment warns about were not
// silently dropped by a later `prisma migrate dev` run (design.md Open
// Questions — this exact incident already happened once, twice more before
// this migration; see 20260901094525_add_inspectable_element/migration.sql).
describe('InspectableElement schema (migration integration guard)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // design.md "Interfaces" SQL block: the FK to Community(id) has no
  // `@relation` in schema.prisma (ADR-013), so it is invisible to Prisma's
  // migration diffing — this is the sole guard against it being dropped.
  it('the hand-written FK InspectableElement_communityId_fkey is present in pg_constraint with ON DELETE RESTRICT', async () => {
    const rows = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'InspectableElement_communityId_fkey'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].definition).toContain('FOREIGN KEY ("communityId")');
    expect(rows[0].definition).toContain('REFERENCES "Community"(id)');
    expect(rows[0].definition).toContain('ON DELETE RESTRICT');
  });

  // design.md Data Flow + Decision 6: every list query and the community
  // delete guard's NOT EXISTS subquery filter on communityId — Postgres
  // does not auto-index FK columns, so this index is load-bearing, not
  // cosmetic.
  it('the communityId index is present in pg_indexes', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'InspectableElement'
        AND indexname = 'InspectableElement_communityId_idx'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('"communityId"');
  });

  // Regression guard for the concrete incident this migration's own comment
  // documents: `prisma migrate dev --create-only` generated 5
  // DropForeignKey statements for the pre-existing `@relation`-less FKs
  // (CommunityRepresentative x2, CommunityTechnician x2,
  // User_maintenanceCompanyId) because none of them have a `@relation` in
  // schema.prisma. Those statements were deleted from this migration by
  // hand; this asserts they never actually ran.
  it('does not drop the pre-existing community and maintenance-company FKs (Prisma-invisible schema objects incident)', async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'CommunityRepresentative_communityId_fkey',
        'CommunityRepresentative_userId_fkey',
        'CommunityTechnician_communityId_fkey',
        'CommunityTechnician_userId_fkey',
        'User_maintenanceCompanyId_fkey'
      )
    `;

    expect(rows.map((r) => r.conname).sort()).toEqual([
      'CommunityRepresentative_communityId_fkey',
      'CommunityRepresentative_userId_fkey',
      'CommunityTechnician_communityId_fkey',
      'CommunityTechnician_userId_fkey',
      'User_maintenanceCompanyId_fkey',
    ]);
  });

  // design.md Decision 3: `installedAt` must be a Postgres `DATE`, not a
  // `TIMESTAMP(3)` like every other temporal column in this schema — a
  // `TIMESTAMP(3)` would round-trip a day off in a non-UTC browser.
  it('the installedAt column type is date', async () => {
    const rows = await prisma.$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'InspectableElement' AND column_name = 'installedAt'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe('date');
  });

  // label-printing/design.md Decision 4 + spec "Pre-Existing Elements Are
  // Backfilled With Codes": the unique index on `code` must be present, and
  // must be the exact name `InspectableElement_code_key` Prisma's own diff
  // engine would generate for `code String @unique` — otherwise the schema
  // drifts from what schema.prisma declares.
  it('the InspectableElement_code_key unique index is present', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'InspectableElement'
        AND indexname = 'InspectableElement_code_key'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE');
    expect(rows[0].indexdef).toContain('(code)');
  });

  // label-printing/design.md Decision 4 — `VARCHAR(10)`, not `CHAR(10)`:
  // blank-padded comparison semantics would make 'ABC       ' compare equal
  // to 'ABC'. Also asserts NOT NULL survives the migration's last statement.
  it('the code column is character varying(10) and NOT NULL', async () => {
    const rows = await prisma.$queryRaw<
      Array<{
        data_type: string;
        character_maximum_length: number | null;
        is_nullable: string;
      }>
    >`
      SELECT data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'InspectableElement' AND column_name = 'code'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe('character varying');
    expect(rows[0].character_maximum_length).toBe(10);
    expect(rows[0].is_nullable).toBe('NO');
  });

  // label-printing spec "Pre-Existing Elements Are Backfilled With Codes":
  // every row that existed before this migration (this DB holds
  // representative rows, not an empty table) must end up with a
  // well-formed, distinct code — proving the backfill actually ran, not
  // just that the column exists.
  it('every existing row has a well-formed code and all codes are distinct', async () => {
    const rows = await prisma.$queryRaw<Array<{ code: string }>>`
      SELECT "code" FROM "InspectableElement"
    `;

    expect(rows.length).toBeGreaterThan(0);

    const codes = rows.map((r) => r.code);
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{10}$/);
    }

    expect(new Set(codes).size).toBe(codes.length);
  });
});
