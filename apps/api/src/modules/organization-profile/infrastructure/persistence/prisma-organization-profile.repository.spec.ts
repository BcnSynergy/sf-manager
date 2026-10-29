import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { OrganizationProfileMissingError } from '../../domain/errors/organization-profile-missing.error';
import { PrismaOrganizationProfileRepository } from './prisma-organization-profile.repository';

// Unit spec against a mocked PrismaService (not integration) — mirrors
// prisma-review-template.repository.spec.ts's mock/assertion-ratio
// discipline (strict-tdd.md): asserts the adapter's error-mapping behaviour
// without needing a real Postgres connection. The row-always-exists
// happy-path guarantee is covered by organization-profile-migration.
// integration.spec.ts (PR1), against real Postgres.
//
// Fresh-context review finding (post-PR3): update() had no missing-row
// handling, unlike get() — a skipped-migration environment defect (design.md
// Decision 1) surfaced as a raw, unmapped PrismaClientKnownRequestError
// (P2025) instead of the module's own OrganizationProfileMissingError,
// inconsistent with get()'s documented invariant that it is "the ONLY place
// that can observe" a missing row. Mirrors maintenance-company's adapter
// P2025 -> *NotFoundError mapping pattern (prisma-maintenance-company.
// repository.ts's mapMutationError/RECORD_NOT_FOUND).
describe('PrismaOrganizationProfileRepository.update()', () => {
  it('maps a P2025 record-not-found error to OrganizationProfileMissingError', async () => {
    const prisma = {
      organizationProfile: {
        update: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError(
            'Record to update not found.',
            {
              code: 'P2025',
              clientVersion: 'test',
            },
          ),
        ),
      },
    };
    const repository = new PrismaOrganizationProfileRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.update({ name: 'New Name' })).rejects.toThrow(
      OrganizationProfileMissingError,
    );
  });

  it('does NOT swallow an unrelated error from update() — rethrows it unchanged', async () => {
    const original = new Error('connection reset');
    const prisma = {
      organizationProfile: {
        update: jest.fn().mockRejectedValue(original),
      },
    };
    const repository = new PrismaOrganizationProfileRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.update({ name: 'New Name' })).rejects.toBe(
      original,
    );
  });

  it('resolves with the mapped domain entity when the update succeeds', async () => {
    const record = {
      id: '01997a00-0000-7000-8000-000000000001',
      name: 'New Name',
      legalName: '',
      taxId: '',
      address: '',
      phone: '',
      email: '',
      logoAssetId: null,
      singleton: true,
    };
    const prisma = {
      organizationProfile: {
        update: jest.fn().mockResolvedValue(record),
      },
    };
    const repository = new PrismaOrganizationProfileRepository(
      prisma as unknown as PrismaService,
    );

    const profile = await repository.update({ name: 'New Name' });

    expect(profile.name).toBe('New Name');
    expect(prisma.organizationProfile.update).toHaveBeenCalledWith({
      where: { singleton: true },
      data: { name: 'New Name' },
    });
  });
});

describe('PrismaOrganizationProfileRepository.setLogoAssetId() (organization-logo S3)', () => {
  it('writes only logoAssetId on the singleton row and maps the post-state', async () => {
    const update = jest.fn().mockResolvedValue({
      id: '01997a00-0000-7000-8000-000000000001',
      name: 'Acme',
      legalName: '',
      taxId: '',
      address: '',
      phone: '',
      email: '',
      logoAssetId: 'logos/abc.png',
      singleton: true,
    });
    const repository = new PrismaOrganizationProfileRepository({
      organizationProfile: { update },
    } as unknown as PrismaService);

    const profile = await repository.setLogoAssetId('logos/abc.png');

    expect(update).toHaveBeenCalledWith({
      where: { singleton: true },
      data: { logoAssetId: 'logos/abc.png' },
    });
    expect(profile.logoAssetId).toBe('logos/abc.png');
    expect(profile.name).toBe('Acme');
  });

  // EN-110: removing the logo records no key.
  it('clears logoAssetId when given null', async () => {
    const update = jest.fn().mockResolvedValue({
      id: '01997a00-0000-7000-8000-000000000001',
      name: 'Acme',
      legalName: '',
      taxId: '',
      address: '',
      phone: '',
      email: '',
      logoAssetId: null,
      singleton: true,
    });
    const repository = new PrismaOrganizationProfileRepository({
      organizationProfile: { update },
    } as unknown as PrismaService);

    const profile = await repository.setLogoAssetId(null);

    expect(update).toHaveBeenCalledWith({
      where: { singleton: true },
      data: { logoAssetId: null },
    });
    expect(profile.logoAssetId).toBeNull();
  });

  it('maps a P2025 record-not-found error to OrganizationProfileMissingError', async () => {
    const repository = new PrismaOrganizationProfileRepository({
      organizationProfile: {
        update: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError(
            'Record to update not found.',
            {
              code: 'P2025',
              clientVersion: 'test',
            },
          ),
        ),
      },
    } as unknown as PrismaService);

    await expect(
      repository.setLogoAssetId('logos/abc.png'),
    ).rejects.toBeInstanceOf(OrganizationProfileMissingError);
  });
});

describe('PrismaOrganizationProfileRepository.clearLogoAssetId() (EN-114)', () => {
  const record = {
    id: '01997a00-0000-7000-8000-000000000001',
    name: 'Acme',
    legalName: '',
    taxId: '',
    address: '',
    phone: '',
    email: '',
    logoAssetId: null,
    singleton: true,
  };

  it('clears the key only where it is still the expected one, and maps the post-state', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue(record);
    const repository = new PrismaOrganizationProfileRepository({
      organizationProfile: { updateMany, findUnique },
    } as unknown as PrismaService);

    const profile = await repository.clearLogoAssetId('logos/abc.png');

    expect(updateMany).toHaveBeenCalledWith({
      where: { singleton: true, logoAssetId: 'logos/abc.png' },
      data: { logoAssetId: null },
    });
    expect(profile?.logoAssetId).toBeNull();
    expect(profile?.name).toBe('Acme');
  });

  it('resolves to null when the key is no longer the expected one', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const findUnique = jest.fn();
    const repository = new PrismaOrganizationProfileRepository({
      organizationProfile: { updateMany, findUnique },
    } as unknown as PrismaService);

    await expect(
      repository.clearLogoAssetId('logos/abc.png'),
    ).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
