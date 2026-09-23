import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaReviewDocumentNameDirectory } from './prisma-review-document-name-directory';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real Postgres instance (design.md Testing
// Strategy), mirroring prisma-user-directory.integration.spec.ts's shape.
// Asserts the ReviewDocumentNameDirectory port's deliberate bypass of
// ADR-010's default soft-delete filter (community, company) and of
// `findActiveByCommunityAndType`'s deactivation filter (elements) —
// review-export/design.md Decision 4, review-export/specs/review-document
// "Deleted context still labels the document" / "A decommissioned or
// soft-deleted element still labels its entry".
//
// Unlike prisma-user-directory.integration.spec.ts (which reuses the app's
// dev database with no per-test cleanup, relying only on unique fixture
// values), this suite deletes every row it creates in `afterEach` — the dev
// database is shared across suites and has previously been left polluted
// by a prior run, so this spec must not add to that.
describe('PrismaReviewDocumentNameDirectory (integration)', () => {
  let prisma: PrismaService;
  let directory: PrismaReviewDocumentNameDirectory;
  let communityIds: string[];
  let companyIds: string[];
  let elementIds: string[];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    directory = new PrismaReviewDocumentNameDirectory(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    communityIds = [];
    companyIds = [];
    elementIds = [];
  });

  afterEach(async () => {
    if (elementIds.length > 0) {
      await prisma.inspectableElement.deleteMany({
        where: { id: { in: elementIds } },
      });
    }
    if (communityIds.length > 0) {
      await prisma.community.deleteMany({
        where: { id: { in: communityIds } },
      });
    }
    if (companyIds.length > 0) {
      await prisma.maintenanceCompany.deleteMany({
        where: { id: { in: companyIds } },
      });
    }
    jest.restoreAllMocks();
  });

  const uniqueLabel = (label: string) => `${label}-${randomUUID()}`;

  const createCommunity = async (
    deletedAt: Date | null,
  ): Promise<{ id: string; name: string }> => {
    const id = idGenerator.generate();
    const name = uniqueLabel('Sunset Towers');
    await prisma.community.create({
      data: {
        id,
        name,
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt,
      },
    });
    communityIds.push(id);
    return { id, name };
  };

  const createCompany = async (
    deletedAt: Date | null,
  ): Promise<{ id: string; name: string }> => {
    const id = idGenerator.generate();
    const name = uniqueLabel('Acme Maintenance');
    await prisma.maintenanceCompany.create({
      data: {
        id,
        name,
        taxId: uniqueLabel('tax'),
        contactInfo: 'ops@example.com',
        deletedAt,
      },
    });
    companyIds.push(id);
    return { id, name };
  };

  const createElement = async (
    communityId: string,
    overrides: { deletedAt?: Date | null; deactivatedAt?: Date | null },
  ): Promise<{ id: string; code: string; name: string; location: string }> => {
    const id = idGenerator.generate();
    const code = uniqueLabel('EX').slice(0, 10);
    const name = uniqueLabel('Extinguisher');
    const location = 'Lobby';
    await prisma.inspectableElement.create({
      data: {
        id,
        communityId,
        elementType: 'EXTINGUISHER',
        name,
        location,
        installedAt: new Date('2024-01-01'),
        code,
        deletedAt: overrides.deletedAt ?? null,
        deactivatedAt: overrides.deactivatedAt ?? null,
      },
    });
    elementIds.push(id);
    return { id, code, name, location };
  };

  describe('findCommunityName', () => {
    it('names a soft-deleted community', async () => {
      const community = await createCommunity(new Date());

      await expect(directory.findCommunityName(community.id)).resolves.toBe(
        community.name,
      );
    });

    it('names an active community', async () => {
      const community = await createCommunity(null);

      await expect(directory.findCommunityName(community.id)).resolves.toBe(
        community.name,
      );
    });

    it('resolves null for an id with no row', async () => {
      await expect(
        directory.findCommunityName(idGenerator.generate()),
      ).resolves.toBeNull();
    });
  });

  describe('findMaintenanceCompanyName', () => {
    it('names a soft-deleted maintenance company', async () => {
      const company = await createCompany(new Date());

      await expect(
        directory.findMaintenanceCompanyName(company.id),
      ).resolves.toBe(company.name);
    });

    it('names an active maintenance company', async () => {
      const company = await createCompany(null);

      await expect(
        directory.findMaintenanceCompanyName(company.id),
      ).resolves.toBe(company.name);
    });

    it('resolves null for an id with no row', async () => {
      await expect(
        directory.findMaintenanceCompanyName(idGenerator.generate()),
      ).resolves.toBeNull();
    });
  });

  describe('findElementsByIds', () => {
    it('identifies a soft-deleted element by its real code, name and location', async () => {
      const community = await createCommunity(null);
      const element = await createElement(community.id, {
        deletedAt: new Date(),
      });

      const result = await directory.findElementsByIds([element.id]);

      expect(result.get(element.id)).toEqual({
        code: element.code,
        name: element.name,
        location: element.location,
      });
    });

    it('identifies a deactivated element by its real code, name and location', async () => {
      const community = await createCommunity(null);
      const element = await createElement(community.id, {
        deactivatedAt: new Date(),
      });

      const result = await directory.findElementsByIds([element.id]);

      expect(result.get(element.id)).toEqual({
        code: element.code,
        name: element.name,
        location: element.location,
      });
    });

    it('resolves an id with no row as absent from the map, not an error', async () => {
      const result = await directory.findElementsByIds([
        idGenerator.generate(),
      ]);

      expect(result.size).toBe(0);
    });

    it('resolves an empty id list to an empty map', async () => {
      const result = await directory.findElementsByIds([]);

      expect(result.size).toBe(0);
    });

    it('resolves every id in exactly one batched query, not one per id', async () => {
      const community = await createCommunity(null);
      const elementA = await createElement(community.id, {});
      const elementB = await createElement(community.id, {
        deactivatedAt: new Date(),
      });
      const findManySpy = jest.spyOn(prisma.inspectableElement, 'findMany');

      const result = await directory.findElementsByIds([
        elementA.id,
        elementB.id,
        idGenerator.generate(),
      ]);

      expect(findManySpy).toHaveBeenCalledTimes(1);
      expect(result.size).toBe(2);
    });
  });
});
