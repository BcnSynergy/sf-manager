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

  // EN-112: an upload that replaces the logo between reading the key and
  // reading the file deletes the file this read was about to serve.
  describe('a read racing a change of the logo (EN-112)', () => {
    // Runs each key's change the first time that key is read from storage,
    // as if it completed between the key read and the file read.
    function changeWhenReading(changes: Record<string, () => Promise<void>>) {
      const get = storage.get.bind(storage) as (
        key: string,
      ) => Promise<Buffer | null>;
      const pending = new Map(Object.entries(changes));
      return jest
        .spyOn(storage, 'get')
        .mockImplementation(async (requested: string) => {
          const change = pending.get(requested);
          if (change) {
            pending.delete(requested);
            await change();
          }
          return get(requested);
        });
    }

    async function replace(oldKey: string, newKey: string, bytes: string) {
      await storage.put(newKey, Buffer.from(bytes));
      await repository.setLogoAssetId(newKey);
      await storage.delete(oldKey);
    }

    beforeEach(async () => {
      await storage.put('logos/old.png', Buffer.from('old-bytes'));
      await repository.setLogoAssetId('logos/old.png');
    });

    it('serves the new logo when a replacing upload deleted the old file', async () => {
      changeWhenReading({
        'logos/old.png': () =>
          replace('logos/old.png', 'logos/new.webp', 'new-bytes'),
      });

      expect(await useCase.execute()).toEqual({
        content: Buffer.from('new-bytes'),
        contentType: 'image/webp',
      });
    });

    it('returns null when the logo was removed in the meantime', async () => {
      changeWhenReading({
        'logos/old.png': async () => {
          await repository.setLogoAssetId(null);
          await storage.delete('logos/old.png');
        },
      });

      expect(await useCase.execute()).toBeNull();
    });

    it('retries only once, so back-to-back replacements end in null', async () => {
      const getSpy = changeWhenReading({
        'logos/old.png': () =>
          replace('logos/old.png', 'logos/second.png', 'second-bytes'),
        'logos/second.png': () =>
          replace('logos/second.png', 'logos/third.png', 'third-bytes'),
      });

      expect(await useCase.execute()).toBeNull();
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    it('does not retry when the key is unchanged and the file is gone', async () => {
      await storage.delete('logos/old.png');
      const readSpy = jest.spyOn(repository, 'get');
      const fileSpy = jest.spyOn(storage, 'get');

      expect(await useCase.execute()).toBeNull();
      expect(readSpy).toHaveBeenCalledTimes(2);
      expect(fileSpy).toHaveBeenCalledTimes(1);
    });
  });
});
