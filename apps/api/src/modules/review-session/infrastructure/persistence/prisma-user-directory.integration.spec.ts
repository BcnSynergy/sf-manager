import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaUserDirectory } from './prisma-user-directory';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real Postgres instance (design.md Testing
// Strategy), mirroring prisma-maintenance-company-lookup.repository
// .integration.spec.ts. Phase 1 covers `findMaintenanceCompanyId` only
// (design.md Decision 5, write-path half) — `findEmailsByIds` is Phase 3's.
describe('PrismaUserDirectory.findMaintenanceCompanyId (integration)', () => {
  let prisma: PrismaService;
  let directory: PrismaUserDirectory;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    directory = new PrismaUserDirectory(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const uniqueLabel = (label: string) => `${label}-${randomUUID()}`;

  const createCompany = async (): Promise<string> => {
    const id = idGenerator.generate();
    await prisma.maintenanceCompany.create({
      data: {
        id,
        name: uniqueLabel('Acme Maintenance'),
        taxId: uniqueLabel('tax'),
        contactInfo: 'ops@example.com',
        deletedAt: null,
      },
    });
    return id;
  };

  const createUser = async (
    maintenanceCompanyId: string | null,
  ): Promise<string> => {
    const id = idGenerator.generate();
    await prisma.user.create({
      data: {
        id,
        email: `${uniqueLabel('performer')}@example.com`,
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId,
        deletedAt: null,
      },
    });
    return id;
  };

  it("returns the user's current maintenance company id", async () => {
    const companyId = await createCompany();
    const userId = await createUser(companyId);

    await expect(directory.findMaintenanceCompanyId(userId)).resolves.toBe(
      companyId,
    );
  });

  it('returns null for a user with no maintenance company', async () => {
    const userId = await createUser(null);

    await expect(
      directory.findMaintenanceCompanyId(userId),
    ).resolves.toBeNull();
  });

  it('returns null for an id that does not exist at all', async () => {
    await expect(
      directory.findMaintenanceCompanyId(idGenerator.generate()),
    ).resolves.toBeNull();
  });
});
