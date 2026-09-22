import 'dotenv/config';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ORGANIZATION_PROFILE_SENTINEL_ID } from '../../domain/organization-profile.fixture';

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring maintenance-company-migration.integration
// .spec.ts / review-session-migration.integration.spec.ts.
//
// design.md Decision 1: the singleton guard — `UNIQUE("singleton")` +
// hand-written CHECK ("singleton") — makes a second OrganizationProfile row
// STRUCTURALLY IMPOSSIBLE. The CHECK is Prisma-invisible (Prisma's DSL
// cannot express CHECK constraints) and could be silently dropped by a
// future `prisma migrate dev`/`migrate reset` regenerating this migration —
// see the WARNING comment at the top of
// 20260922100000_add_organization_profile/migration.sql. This suite is the
// only guard against that drift, mirroring the established
// pg_constraint/pg_indexes integration-guard treatment
// (ElementReviewEntry_observations_not_blank precedent).
describe('OrganizationProfile schema (migration integration guard)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // spec.md "The Profile Row Exists Before Any Request": the seeded row
  // must exist, blank, with no application request of any kind having been
  // issued.
  //
  // Remediation (sdd-verify CRITICAL-1, 2026-09-22, second pass): the first
  // remediation attempt captured the live row, overwrote it to blank,
  // asserted, then restored the capture — which is both destructive (an
  // interrupted run loses the captured values for good, since they only
  // ever existed in memory) and tautological (the assertion checks a state
  // the same `beforeEach` just wrote, not what `prisma migrate deploy`
  // actually seeded). Caught by fresh-context review.
  //
  // This suite is read-only against the row's data, permanently. Two
  // separate invariants, tested two different ways:
  //   - The six text fields are only EVER blank immediately after a fresh
  //     migration — this project's own PR6 browser verification (and any
  //     future admin use) legitimately fills them in, so asserting their
  //     live values would either be tautological (if we reset them first)
  //     or flaky (if we don't). What IS permanent, because Postgres bakes it
  //     into the DDL rather than the row, is the column DEFAULT itself — so
  //     that is what this suite checks: a structural fact about the
  //     migration, not the row's current contents.
  //   - `id`, `singleton` and `logoAssetId`, by contrast, ARE permanent for
  //     the life of this table: `id` is the hand-picked literal from the
  //     migration and application code never references it (design.md
  //     Decision 1); `singleton` never changes (the CHECK requires it);
  //     `logoAssetId` is permanently unwritable this slice (ADR-012). These
  //     are safe to assert directly against the live row, read-only, and
  //     doing so is what actually proves "the seeded row" (this specific
  //     `id`) is the one and only row, rather than merely that *some* row
  //     exists.
  //
  // Known trade-off (fresh-context review, second pass): checking the DDL
  // DEFAULT instead of the row's live text values means a broken seed
  // INSERT that supplies a non-blank literal for one of the six columns
  // (bypassing the DEFAULT) would NOT be caught here. No other test in the
  // repo reads this row's text fields either. Accepted rather than
  // reverting to the destructive/tautological pattern above: this project's
  // integration specs run against one shared, long-lived dev Postgres
  // instance (not a fresh-per-run database), so there is no hermetic way to
  // assert a row's *contents* stay pristine once real usage can write to it
  // — only that the schema *would* seed it blank. The equivalent
  // maintenance-company-migration.integration.spec.ts / review-session-
  // migration.integration.spec.ts precedents this file mirrors have the
  // same shape: structural (constraint/index/column) checks, not live-data
  // checks, for exactly this reason.
  //
  // The `inspectable-element-migration.integration.spec.ts` sibling has the
  // same live-row-assertion anti-pattern this remediation just fixed here
  // (`expect(rows.length).toBeGreaterThan(0)` reading mutable shared-DB
  // state) — out of scope for this PR (organization-profile only, ADR-006).
  // Tracked at Engram `discovery/non-hermetic-migration-integration-specs`
  // (id 299), not yet turned into an open task for that module.
  describe('seed state (hermetic — read-only, never writes to the live row)', () => {
    const TEXT_COLUMNS = [
      'name',
      'legalName',
      'taxId',
      'address',
      'phone',
      'email',
    ] as const;

    it("every text column defaults to blank per the migration DDL, independent of the row's current contents", async () => {
      const rows = await prisma.$queryRaw<
        Array<{ column_name: string; column_default: string | null }>
      >`
        SELECT column_name, column_default
        FROM information_schema.columns
        WHERE table_name = 'OrganizationProfile'
          AND column_name = ANY(${TEXT_COLUMNS})
      `;

      expect(rows).toHaveLength(TEXT_COLUMNS.length);
      for (const column of TEXT_COLUMNS) {
        const row = rows.find((r) => r.column_name === column);
        expect(row?.column_default).toBe("''::text");
      }
    });

    it('the seeded row is the only row, at its fixed id, is the singleton, and logoAssetId is still permanently null', async () => {
      const rows = await prisma.organizationProfile.findMany();

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(ORGANIZATION_PROFILE_SENTINEL_ID);
      expect(rows[0].singleton).toBe(true);
      expect(rows[0].logoAssetId).toBeNull();
    });
  });

  // design.md Decision 1: the hand-written CHECK is the structural half of
  // the singleton guard and is invisible to schema.prisma.
  it('the hand-written CHECK constraint OrganizationProfile_singleton_true is present in pg_constraint', async () => {
    const rows = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'OrganizationProfile_singleton_true'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].definition).toContain('CHECK');
    expect(rows[0].definition).toContain('singleton');
  });

  // design.md Decision 1: the unique index is the Prisma-visible half of the
  // guard and is what gives the adapter a legal `findUnique`/`update` key.
  it('the unique index OrganizationProfile_singleton_key is present in pg_indexes', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'OrganizationProfile'
        AND indexname = 'OrganizationProfile_singleton_key'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE INDEX');
    // Postgres' own `pg_indexes.indexdef` does not quote a lower-case,
    // non-reserved column name back out — unlike `pg_get_constraintdef`'s
    // CHECK body, which does. Verified directly against the running
    // container rather than assumed.
    expect(rows[0].indexdef).toContain('(singleton)');
  });

  // design.md Decision 1: a second row is structurally impossible regardless
  // of which sentinel value is used to insert it — `true` collides on the
  // unique index, `false` is refused by the CHECK.
  it.each<[string, boolean]>([
    ['singleton = true (collides on the unique index)', true],
    ['singleton = false (refused by the CHECK)', false],
  ])('a second INSERT fails with %s', async (_case, singleton) => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "OrganizationProfile"
          ("id","name","legalName","taxId","address","phone","email","logoAssetId","singleton")
         VALUES
          (gen_random_uuid(),'x','x','x','x','x','x',NULL,$1)`,
        singleton,
      ),
    ).rejects.toThrow();
  });

  // Regression guard mirroring maintenance-company-migration.integration
  // .spec.ts / review-session-migration.integration.spec.ts's own precedent:
  // confirms this migration did not silently drop any pre-existing
  // hand-written index/CHECK from earlier migrations.
  //
  // NOTE — scoped to CHECK + indexes only, deliberately excluding the
  // hand-written FKs (e.g. User_maintenanceCompanyId_fkey) that the
  // maintenance-company/review-session precedent tests also assert: at
  // apply time, ALL hand-written FK constraints were found absent from the
  // running docker-compose Postgres container/volume, even though
  // `_prisma_migrations` shows every migration (including the ones that
  // hand-write those FKs) as applied. It is environment drift in this
  // specific Postgres volume, not something PR1 caused (OrganizationProfile
  // declares no FK at all), and is out of this PR's scope to fix. Recorded
  // for traceability, not just claimed: Engram topic key
  // `discovery/dev-db-fk-drift`, and openspec/changes/organization-profile/
  // tasks.md's "Findings (PR 1)" section (full reproduction steps and a
  // clean-database counter-test).
  it('does not drop the pre-existing hand-written partial unique indexes and CHECK constraints', async () => {
    // Two independent read-only queries against different catalog tables —
    // neither depends on the other having run or committed anything, so
    // running them concurrently is safe (unlike the negative-insert cases
    // above, where each statement's rejection has to be awaited in place).
    const [constraintRows, indexRows] = await Promise.all([
      prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint
        WHERE conname IN ('ElementReviewEntry_observations_not_blank')
      `,
      prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE indexname IN (
          'MaintenanceCompany_taxId_active_key',
          'ReviewSession_open_draft_key'
        )
      `,
    ]);

    expect(constraintRows.map((r) => r.conname).sort()).toEqual(
      ['ElementReviewEntry_observations_not_blank'].sort(),
    );

    expect(indexRows.map((r) => r.indexname).sort()).toEqual(
      [
        'MaintenanceCompany_taxId_active_key',
        'ReviewSession_open_draft_key',
      ].sort(),
    );
  });
});
