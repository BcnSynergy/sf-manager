import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { GetOrganizationLogoUseCase } from './get-organization-logo.use-case';
import { InMemoryOrganizationProfileRepository } from './testing/in-memory-organization-profile.repository';

describe('GetOrganizationLogoUseCase (organization-logo S3)', () => {
  let repository: InMemoryOrganizationProfileRepository;
  let storage: InMemoryFileStorage;
  let useCase: GetOrganizationLogoUseCase;

  beforeEach(() => {
    repository = new InMemoryOrganizationProfileRepository();
    storage = new InMemoryFileStorage();
    useCase = new GetOrganizationLogoUseCase(repository, storage);
  });

  it('returns the stored bytes with the content type of the stored format', async () => {
    await storage.put('logos/abc.webp', Buffer.from('webp-bytes'));
    await repository.setLogoAssetId('logos/abc.webp');

    expect(await useCase.execute()).toEqual({
      content: Buffer.from('webp-bytes'),
      contentType: 'image/webp',
    });
  });

  it('returns null when the profile has no logo', async () => {
    expect(await useCase.execute()).toBeNull();
  });

  it('returns null when the recorded file is missing from storage', async () => {
    await repository.setLogoAssetId('logos/gone.png');

    expect(await useCase.execute()).toBeNull();
  });
});
