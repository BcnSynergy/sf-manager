import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { RemoveOrganizationLogoUseCase } from './remove-organization-logo.use-case';
import { InMemoryOrganizationProfileRepository } from './testing/in-memory-organization-profile.repository';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

describe('RemoveOrganizationLogoUseCase (EN-110)', () => {
  let repository: InMemoryOrganizationProfileRepository;
  let storage: InMemoryFileStorage;
  let useCase: RemoveOrganizationLogoUseCase;

  async function seedLogo(): Promise<void> {
    await storage.put('logos/id-1.png', PNG);
    await repository.setLogoAssetId('logos/id-1.png');
  }

  beforeEach(() => {
    repository = new InMemoryOrganizationProfileRepository();
    storage = new InMemoryFileStorage();
    useCase = new RemoveOrganizationLogoUseCase(repository, storage);
  });

  it('clears the recorded key and deletes the file', async () => {
    await seedLogo();

    const profile = await useCase.execute();

    expect(profile.logoAssetId).toBeNull();
    expect((await repository.get()).logoAssetId).toBeNull();
    expect(storage.keys()).toEqual([]);
  });

  it('keeps the other profile fields unchanged', async () => {
    await repository.update({ name: 'Acme' });
    await seedLogo();

    const profile = await useCase.execute();

    expect(profile.name).toBe('Acme');
  });

  it('succeeds without a write or a delete when there is no logo', async () => {
    const setSpy = jest.spyOn(repository, 'setLogoAssetId');
    const clearSpy = jest.spyOn(repository, 'clearLogoAssetId');
    const deleteSpy = jest.spyOn(storage, 'delete');

    const profile = await useCase.execute();

    expect(profile.logoAssetId).toBeNull();
    expect(setSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('keeps the logo and its file when clearing the key fails', async () => {
    await seedLogo();
    jest
      .spyOn(repository, 'clearLogoAssetId')
      .mockRejectedValueOnce(new Error('database down'));

    await expect(useCase.execute()).rejects.toThrow('database down');
    expect((await repository.get()).logoAssetId).toBe('logos/id-1.png');
    expect(storage.keys()).toEqual(['logos/id-1.png']);
  });

  it('still succeeds when deleting the file fails', async () => {
    await seedLogo();
    jest
      .spyOn(storage, 'delete')
      .mockRejectedValueOnce(new Error('disk error'));

    const profile = await useCase.execute();

    expect(profile.logoAssetId).toBeNull();
    expect((await repository.get()).logoAssetId).toBeNull();
    expect(storage.keys()).toEqual(['logos/id-1.png']);
  });

  // EN-114: an upload that records its key after the removal read it wins.
  it('changes nothing when an upload records a new logo after the key was read', async () => {
    await seedLogo();
    const readByRemoval = await repository.get();
    jest.spyOn(repository, 'get').mockImplementationOnce(async () => {
      await storage.put('logos/id-2.png', PNG);
      await repository.setLogoAssetId('logos/id-2.png');
      return readByRemoval;
    });
    const deleteSpy = jest.spyOn(storage, 'delete');

    const profile = await useCase.execute();

    expect(profile.logoAssetId).toBe('logos/id-2.png');
    expect((await repository.get()).logoAssetId).toBe('logos/id-2.png');
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(storage.keys()).toContain('logos/id-2.png');
  });
});
