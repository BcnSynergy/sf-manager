import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaMaintenanceCompanyLookup } from './prisma-maintenance-company-lookup.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring prisma-user.repository.integration.spec.ts.
// Talks to `prisma.maintenanceCompany` directly (not through
// MaintenanceCompanyRepository, which does not exist until Phase 8) — this
// adapter is a read-only existence probe owned entirely by `users`
// (design.md Decision 4).
describe('PrismaMaintenanceCompanyLookup (integration)', () => {
  let prisma: PrismaService;
  let lookup: PrismaMaintenanceCompanyLookup;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    lookup = new PrismaMaintenanceCompanyLookup(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const uniqueTaxId = (label: string) => `${label}-${randomUUID()}`;

  it('returns true for an active (non-soft-deleted) company', async () => {
    const id = idGenerator.generate();
    await prisma.maintenanceCompany.create({
      data: {
        id,
        name: 'Acme Maintenance',
        taxId: uniqueTaxId('active'),
        contactInfo: 'ops@acme.example',
        deletedAt: null,
      },
    });

    await expect(lookup.existsActive(id)).resolves.toBe(true);
  });

  it('returns false for a soft-deleted company', async () => {
    const id = idGenerator.generate();
    await prisma.maintenanceCompany.create({
      data: {
        id,
        name: 'Retired Maintenance Co',
        taxId: uniqueTaxId('soft-deleted'),
        contactInfo: 'ops@retired.example',
        deletedAt: new Date(),
      },
    });

    await expect(lookup.existsActive(id)).resolves.toBe(false);
  });

  it('returns false for an id that does not exist at all', async () => {
    await expect(lookup.existsActive(idGenerator.generate())).resolves.toBe(
      false,
    );
  });
});
