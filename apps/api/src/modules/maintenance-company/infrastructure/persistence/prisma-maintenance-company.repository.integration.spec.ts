import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { User } from '../../../users/domain/user.entity';
import { PrismaUserRepository } from '../../../users/infrastructure/persistence/prisma-user.repository';
import { TaxIdAlreadyInUseError } from '../../domain/errors/tax-id-already-in-use.error';
import { MaintenanceCompany } from '../../domain/maintenance-company.entity';
import { PrismaMaintenanceCompanyRepository } from './prisma-maintenance-company.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring prisma-user.repository.integration.spec.ts
// and prisma-community.repository.integration.spec.ts. Reuses the app's own
// dev database (no dedicated test-database mechanism in this repo yet).
describe('PrismaMaintenanceCompanyRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaMaintenanceCompanyRepository;
  let userRepository: PrismaUserRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaMaintenanceCompanyRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Unique per test run so repeated runs never collide on the partial
  // unique index, and so tests don't depend on cross-run cleanup.
  const uniqueTaxId = (label: string) => `${label}-${randomUUID()}`;
  const uniqueEmail = (label: string) => `${label}-${randomUUID()}@example.com`;

  const makeCompany = (taxId: string): MaintenanceCompany =>
    new MaintenanceCompany({
      id: idGenerator.generate(),
      name: 'Acme Maintenance',
      taxId,
      contactInfo: 'ops@acme.example',
      deletedAt: null,
    });

  // design.md Decision 2: the hand-written partial unique index is the SOLE
  // enforcement of "taxId unique among active companies" — regression guard
  // for the schema object itself (also covered directly in
  // maintenance-company-migration.integration.spec.ts; repeated here so this
  // suite documents the guarantee the adapter's error mapping relies on).
  it('the hand-written partial unique index MaintenanceCompany_taxId_active_key is present in pg_indexes', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'MaintenanceCompany'
        AND indexname = 'MaintenanceCompany_taxId_active_key'
    `;

    expect(rows).toHaveLength(1);
  });

  // design.md Decision 2: the hand-written FK from
  // User.maintenanceCompanyId to MaintenanceCompany(id).
  it('the hand-written FK User_maintenanceCompanyId_fkey is present in pg_constraint', async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname = 'User_maintenanceCompanyId_fkey'
    `;

    expect(rows).toHaveLength(1);
  });

  it('create() rejects a duplicate active taxId with TaxIdAlreadyInUseError', async () => {
    const taxId = uniqueTaxId('create-duplicate');
    await repository.create(makeCompany(taxId));

    await expect(repository.create(makeCompany(taxId))).rejects.toThrow(
      TaxIdAlreadyInUseError,
    );
  });

  it('accepts an active company and a soft-deleted company sharing the same taxId', async () => {
    const taxId = uniqueTaxId('active-plus-deleted');
    const softDeleted = makeCompany(taxId);
    await repository.create(softDeleted);
    await repository.softDeleteById(softDeleted.id);

    // taxId is now free again (design.md Decision 2) — a new active company
    // may reuse it.
    const reborn = makeCompany(taxId);
    await expect(repository.create(reborn)).resolves.toBeUndefined();

    const found = await repository.findById(reborn.id);
    expect(found?.taxId).toBe(taxId);
  });

  it('updateById() rejects moving a company onto an in-use active taxId', async () => {
    const heldTaxId = uniqueTaxId('update-collision-held');
    await repository.create(makeCompany(heldTaxId));
    const mover = makeCompany(uniqueTaxId('update-collision-mover'));
    await repository.create(mover);

    await expect(
      repository.updateById(mover.id, { taxId: heldTaxId }),
    ).rejects.toThrow(TaxIdAlreadyInUseError);
  });

  it('findById() and findAll() exclude a soft-deleted company (ADR-010)', async () => {
    const company = makeCompany(uniqueTaxId('soft-delete-filter'));
    await repository.create(company);
    await repository.softDeleteById(company.id);

    expect(await repository.findById(company.id)).toBeNull();
    const all = await repository.findAll();
    expect(all.some((c) => c.id === company.id)).toBe(false);
  });

  it('softDeleteById() returns true and sets deletedAt for a company with no active users attached', async () => {
    const company = makeCompany(uniqueTaxId('soft-delete-no-users'));
    await repository.create(company);

    const wasDeleted = await repository.softDeleteById(company.id);

    expect(wasDeleted).toBe(true);
    expect(await repository.findById(company.id)).toBeNull();
  });

  it('softDeleteById() returns false and leaves deletedAt null for a company with an active user attached', async () => {
    const company = makeCompany(uniqueTaxId('soft-delete-blocked'));
    await repository.create(company);
    await userRepository.create(
      new User({
        id: idGenerator.generate(),
        email: uniqueEmail('soft-delete-blocked-user'),
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        maintenanceCompanyId: company.id,
      }),
    );

    const wasDeleted = await repository.softDeleteById(company.id);

    expect(wasDeleted).toBe(false);
    // This is the assertion that actually proves the NOT EXISTS guard runs
    // against real Postgres, not just the in-memory fake: deletedAt must
    // stay NULL even though the row exists and was not already deleted.
    const stillActive = await repository.findById(company.id);
    expect(stillActive).not.toBeNull();
    expect(stillActive?.deletedAt).toBeNull();
  });

  it('softDeleteById() returns false for a non-existent company id', async () => {
    const wasDeleted = await repository.softDeleteById(idGenerator.generate());

    expect(wasDeleted).toBe(false);
  });

  it('softDeleteById() returns false for an already soft-deleted company', async () => {
    const company = makeCompany(uniqueTaxId('soft-delete-already-deleted'));
    await repository.create(company);
    await repository.softDeleteById(company.id);

    const secondAttempt = await repository.softDeleteById(company.id);

    expect(secondAttempt).toBe(false);
  });
});
