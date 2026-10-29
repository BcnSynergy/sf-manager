import 'dotenv/config';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaOrganizationProfileRepository } from './prisma-organization-profile.repository';

// EN-114: the conditional clear is what keeps a logo removal from undoing an
// upload that recorded its key in between, so it is checked against a real
// Postgres instead of a mocked updateMany. The organization profile row is
// shared with the migration guard, which expects logoAssetId to be null, so
// every test restores it.
describe('PrismaOrganizationProfileRepository.clearLogoAssetId() (integration, EN-114)', () => {
  let prisma: PrismaService;
  let repository: PrismaOrganizationProfileRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaOrganizationProfileRepository(prisma);
  });

  afterEach(async () => {
    await repository.setLogoAssetId(null);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('clears the key when it is still the expected one', async () => {
    await repository.setLogoAssetId('logos/first.png');

    const profile = await repository.clearLogoAssetId('logos/first.png');

    expect(profile?.logoAssetId).toBeNull();
    expect((await repository.get()).logoAssetId).toBeNull();
  });

  it('writes nothing and resolves to null when another write changed the key', async () => {
    await repository.setLogoAssetId('logos/first.png');
    await repository.setLogoAssetId('logos/second.png');

    const profile = await repository.clearLogoAssetId('logos/first.png');

    expect(profile).toBeNull();
    expect((await repository.get()).logoAssetId).toBe('logos/second.png');
  });

  it('resolves to null when the key was already cleared', async () => {
    const profile = await repository.clearLogoAssetId('logos/first.png');

    expect(profile).toBeNull();
    expect((await repository.get()).logoAssetId).toBeNull();
  });
});
