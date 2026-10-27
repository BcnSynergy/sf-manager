import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import {
  LogoTooLargeError,
  UnsupportedLogoFormatError,
} from '../../domain/errors/organization-logo.errors';
import { LOGO_MAX_BYTES } from '../../domain/organization-logo';
import { jpegHeader, pngHeader } from '../../domain/testing/logo-fixtures';
import { UploadOrganizationLogoUseCase } from './upload-organization-logo.use-case';
import { InMemoryOrganizationProfileRepository } from './testing/in-memory-organization-profile.repository';

const PNG = pngHeader();
const JPEG = jpegHeader();

class SequenceIdGenerator implements IdGenerator {
  private next = 1;

  generate(): string {
    return `id-${this.next++}`;
  }
}

describe('UploadOrganizationLogoUseCase (organization-logo S1-S3)', () => {
  let repository: InMemoryOrganizationProfileRepository;
  let storage: InMemoryFileStorage;
  let useCase: UploadOrganizationLogoUseCase;

  beforeEach(() => {
    repository = new InMemoryOrganizationProfileRepository();
    storage = new InMemoryFileStorage();
    useCase = new UploadOrganizationLogoUseCase(
      repository,
      storage,
      new SequenceIdGenerator(),
    );
  });

  it('stores the bytes under an opaque logos/ key and records that key on the profile', async () => {
    const profile = await useCase.execute(PNG);

    expect(profile.logoAssetId).toBe('logos/id-1.png');
    expect(storage.keys()).toEqual(['logos/id-1.png']);
    expect(await storage.get('logos/id-1.png')).toEqual(PNG);
    expect((await repository.get()).logoAssetId).toBe('logos/id-1.png');
  });

  it('replaces the previous logo and deletes its file', async () => {
    await useCase.execute(PNG);

    const profile = await useCase.execute(JPEG);

    expect(profile.logoAssetId).toBe('logos/id-2.jpg');
    expect(storage.keys()).toEqual(['logos/id-2.jpg']);
  });

  it('keeps the other profile fields unchanged', async () => {
    await repository.update({ name: 'Acme' });

    const profile = await useCase.execute(PNG);

    expect(profile.name).toBe('Acme');
  });

  it('rejects content that is not PNG, JPEG or WebP and changes nothing', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');

    await expect(useCase.execute(svg)).rejects.toBeInstanceOf(
      UnsupportedLogoFormatError,
    );
    expect(storage.keys()).toEqual([]);
    expect((await repository.get()).logoAssetId).toBeNull();
  });

  it('rejects content over the size limit and changes nothing', async () => {
    const tooLarge = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]);

    await expect(useCase.execute(tooLarge)).rejects.toBeInstanceOf(
      LogoTooLargeError,
    );
    expect(storage.keys()).toEqual([]);
  });

  it('accepts content exactly at the size limit', async () => {
    const atLimit = Buffer.concat([
      PNG,
      Buffer.alloc(LOGO_MAX_BYTES - PNG.length),
    ]);

    await expect(useCase.execute(atLimit)).resolves.toBeDefined();
  });

  it('removes the new file and keeps the previous logo when recording the key fails', async () => {
    await useCase.execute(PNG);
    jest
      .spyOn(repository, 'setLogoAssetId')
      .mockRejectedValueOnce(new Error('database down'));

    await expect(useCase.execute(JPEG)).rejects.toThrow('database down');
    expect(storage.keys()).toEqual(['logos/id-1.png']);
    expect((await repository.get()).logoAssetId).toBe('logos/id-1.png');
  });

  it('still succeeds when deleting the previous file fails', async () => {
    await useCase.execute(PNG);
    jest
      .spyOn(storage, 'delete')
      .mockRejectedValueOnce(new Error('disk error'));

    const profile = await useCase.execute(JPEG);

    expect(profile.logoAssetId).toBe('logos/id-2.jpg');
  });
});
