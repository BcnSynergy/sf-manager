import 'dotenv/config';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring the pg_indexes guard in
// prisma-community-representative.repository.integration.spec.ts.
//
// Phase 2 (PR 2 — schema + migration only) has no
// MaintenanceCompanyRepository yet (that lands in Phase 8), so this guard
// talks to PrismaService directly via raw SQL rather than through a
// repository. It exists precisely because `prisma migrate dev` was
// CONFIRMED at apply time (design.md Open Questions) to regenerate
// `DropForeignKey` statements for hand-written, `@relation`-less FKs it
// cannot see — see the comment at the top of
// 20260827091950_add_maintenance_company/migration.sql for the concrete
// incident. Extend this suite (or fold it into
// prisma-maintenance-company.repository.integration.spec.ts) once PR 8
// lands the real adapter — do not delete it, the drift risk it guards
// against is permanent for as long as ADR-013 forbids `@relation`.
describe('MaintenanceCompany schema (migration integration guard)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // design.md Decision 2: the hand-written partial unique index is the SOLE
  // enforcement of "taxId unique among active companies" and is invisible to
  // schema.prisma, so a later `prisma migrate dev` could silently drop it.
  it('the hand-written partial unique index MaintenanceCompany_taxId_active_key is present in pg_indexes with the expected definition', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'MaintenanceCompany'
        AND indexname = 'MaintenanceCompany_taxId_active_key'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE INDEX');
    expect(rows[0].indexdef).toContain('"taxId"');
    expect(rows[0].indexdef).toContain('WHERE ("deletedAt" IS NULL)');
  });

  // design.md Decision 2: the FK from User.maintenanceCompanyId to
  // MaintenanceCompany(id) has no `@relation` in schema.prisma (ADR-013), so
  // it is equally invisible to Prisma's migration diffing.
  it('the hand-written FK User_maintenanceCompanyId_fkey is present in pg_constraint with ON DELETE RESTRICT', async () => {
    const rows = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'User_maintenanceCompanyId_fkey'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].definition).toContain(
      'FOREIGN KEY ("maintenanceCompanyId")',
    );
    expect(rows[0].definition).toContain('REFERENCES "MaintenanceCompany"(id)');
    expect(rows[0].definition).toContain('ON DELETE RESTRICT');
  });

  // Regression guard for the concrete incident this migration's comment
  // documents: `prisma migrate dev --create-only` generated 4
  // `DropForeignKey` statements for CommunityRepresentative/
  // CommunityTechnician's hand-written FKs (added in
  // 20260825120000_add_community_and_assignments), because those FKs also
  // have no `@relation` in schema.prisma. Those statements were deleted from
  // this migration by hand; this asserts they never actually ran.
  it('does not drop the pre-existing community assignment FKs (Prisma-invisible schema objects incident)', async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN (
        'CommunityRepresentative_communityId_fkey',
        'CommunityRepresentative_userId_fkey',
        'CommunityTechnician_communityId_fkey',
        'CommunityTechnician_userId_fkey'
      )
    `;

    expect(rows.map((r) => r.conname).sort()).toEqual([
      'CommunityRepresentative_communityId_fkey',
      'CommunityRepresentative_userId_fkey',
      'CommunityTechnician_communityId_fkey',
      'CommunityTechnician_userId_fkey',
    ]);
  });
});
