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
  // every row that existed before this migration must end up with a
  // well-formed, distinct code — proving the backfill actually ran, not
  // just that the column exists.
  //
  // Made hermetic (tech-debt cleanup, mirroring organization-profile-
  // migration.integration.spec.ts's remediation): this used to read
  // `SELECT "code" FROM "InspectableElement"` and assert on the LIVE row
  // set — `rows.length` depends on how many elements happen to exist in
  // this shared, long-lived dev Postgres instance at test time (zero after
  // a cleanup), which is dev-usage state, not a migration guarantee.
  //
  // The two structural facts the migration SQL actually establishes are
  // both already asserted elsewhere in this file, and together they ARE
  // the full original guarantee:
  //   - "the code column is character varying(10) and NOT NULL" (above):
  //     `ALTER TABLE ... ALTER COLUMN "code" SET NOT NULL` is the LAST
  //     statement of this migration and fails the whole migration closed
  //     if the per-row backfill loop missed any row — so this migration
  //     having applied at all (which every other test here already
  //     depends on) is itself the proof every pre-existing row got a code.
  //   - "the InspectableElement_code_key unique index is present" (above):
  //     the migration creates this UNIQUE index BEFORE running the
  //     backfill loop specifically so uniqueness is DB-enforced during
  //     backfill (the loop retries on `unique_violation`) — the index
  //     existing today, on a table that has taken writes since, is
  //     already proof no duplicate was ever able to land.
  //
  // Known trade-off (same shape as organization-profile's): the exact
  // character-set backfill produces (`[2-9A-HJKMNP-Z]{10}`, excluding
  // easily-confused glyphs) is not DB-enforced by any CHECK constraint —
  // VARCHAR(10) bounds length, not charset — so it cannot be verified
  // hermetically against live, mutable data. The runtime generator draws
  // from the same alphabet and is covered by
  // random-element-code.generator.spec.ts; the one-time SQL backfill loop
  // above is not independently unit-tested, and that gap is accepted here
  // rather than reintroduced as a live-data read.

  // label-printing/design.md Decision 4a + tasks.md 3.10: the PR1
  // transitional bridge (temp_bridge_random_inspectable_element_code() as a
  // column DEFAULT) is mandatory cleanup once the real generator (Phase 3)
  // is wired — the code column must carry no DEFAULT at all afterward, and
  // the bridge function itself must no longer exist.
  it('the code column has no DEFAULT after the PR1 transitional bridge is dropped', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ column_default: string | null }>
    >`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'InspectableElement' AND column_name = 'code'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].column_default).toBeNull();
  });

  it('the temp_bridge_random_inspectable_element_code() function no longer exists', async () => {
    const rows = await prisma.$queryRaw<Array<{ proname: string }>>`
      SELECT proname FROM pg_proc
      WHERE proname = 'temp_bridge_random_inspectable_element_code'
    `;

    expect(rows).toHaveLength(0);
  });

  // review-session/design.md Decision 3 + inspectable-element-management
  // spec.md "Pre-Existing Elements Are Active After the Migration": a plain
  // nullable ADD COLUMN with no DEFAULT needs no explicit backfill — this
  // is a Postgres-level guarantee of ADD COLUMN semantics, not app logic:
  // every row that existed before this migration ends up NULL, i.e.
  // active, by construction. Both structural facts that make that true are
  // asserted here — nullable, and no default — so this migration having
  // applied at all is itself the proof every pre-existing row is NULL.
  //
  // Made hermetic (tech-debt cleanup): a sibling test used to additionally
  // run `SELECT COUNT(*) ... WHERE "deactivatedAt" IS NOT NULL` and assert
  // zero — but ordinary post-migration dev use (deactivating an element
  // through the app, exercised by e.g. review-history's e2e suite against
  // this same shared dev DB) legitimately sets `deactivatedAt` on rows
  // going forward. That is expected, current-state data, not a migration
  // defect, so asserting on it made this suite go red after normal dev
  // use. Removed rather than reworded — the DDL check below already proves
  // everything the migration itself guarantees.
  it('the deactivatedAt column is nullable with no DEFAULT', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ is_nullable: string; column_default: string | null }>
    >`
      SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'InspectableElement' AND column_name = 'deactivatedAt'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
    expect(rows[0].column_default).toBeNull();
  });
});
