import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import {
  jpegHeader,
  pngHeader,
  webpLossyHeader,
} from '../../../organization-profile/domain/testing/logo-fixtures';
import {
  SignatureTooLargeError,
  UnsupportedSignatureFormatError,
} from '../../domain/errors/reviewer-signature.errors';
import { SIGNATURE_MAX_BYTES } from '../../domain/reviewer-signature';
import { InMemoryReviewerSignatureRepository } from './testing/in-memory-reviewer-signature.repository';
import { UploadOwnSignatureUseCase } from './upload-own-signature.use-case';

const PNG = pngHeader();
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
);

class SequenceIdGenerator implements IdGenerator {
  private next = 1;

  generate(): string {
    return `id-${this.next++}`;
  }
}

describe('UploadOwnSignatureUseCase (reviewer-signature: Upload the Own Signature)', () => {
  let repository: InMemoryReviewerSignatureRepository;
  let storage: InMemoryFileStorage;
  let useCase: UploadOwnSignatureUseCase;

  beforeEach(() => {
    repository = new InMemoryReviewerSignatureRepository();
    storage = new InMemoryFileStorage();
    useCase = new UploadOwnSignatureUseCase(
      repository,
      storage,
      new SequenceIdGenerator(),
    );
  });

  it.each([
    ['PNG', PNG, 'signatures/id-1.png'],
    ['JPEG', jpegHeader(), 'signatures/id-1.jpg'],
    ['WebP', webpLossyHeader(), 'signatures/id-1.webp'],
  ])(
    'stores a %s under a fresh signatures/ key and records it for the caller',
    async (_name, content, key) => {
      const status = await useCase.execute('user-1', content);

      expect(status.hasSignature).toBe(true);
      expect(status.updatedAt).toBeInstanceOf(Date);
      expect(storage.keys()).toEqual([key]);
      expect(await storage.get(key)).toEqual(content);
      expect((await repository.findByUserId('user-1'))?.storageKey).toBe(key);
    },
  );

  it('replaces the previous signature and deletes its file', async () => {
    await useCase.execute('user-1', PNG);

    await useCase.execute('user-1', jpegHeader());

    expect(storage.keys()).toEqual(['signatures/id-2.jpg']);
    expect((await repository.findByUserId('user-1'))?.storageKey).toBe(
      'signatures/id-2.jpg',
    );
  });

  it("never touches another user's signature", async () => {
    await useCase.execute('user-1', PNG);

    await useCase.execute('user-2', jpegHeader());

    expect((await repository.findByUserId('user-1'))?.storageKey).toBe(
      'signatures/id-1.png',
    );
    expect(storage.keys()).toEqual([
      'signatures/id-1.png',
      'signatures/id-2.jpg',
    ]);
  });

  it.each([
    ['an SVG image', SVG],
    ['a GIF', Buffer.from('GIF89a\x01\x00')],
  ])('rejects %s and changes nothing', async (_name, content) => {
    await useCase.execute('user-1', PNG);

    await expect(useCase.execute('user-1', content)).rejects.toBeInstanceOf(
      UnsupportedSignatureFormatError,
    );
    expect(storage.keys()).toEqual(['signatures/id-1.png']);
    expect((await repository.findByUserId('user-1'))?.storageKey).toBe(
      'signatures/id-1.png',
    );
  });

  it('accepts exactly 2 MiB and rejects one byte more, changing nothing', async () => {
    const exact = Buffer.concat([
      PNG,
      Buffer.alloc(SIGNATURE_MAX_BYTES - PNG.length),
    ]);
    await useCase.execute('user-1', exact);

    await expect(
      useCase.execute('user-1', Buffer.concat([exact, Buffer.alloc(1)])),
    ).rejects.toBeInstanceOf(SignatureTooLargeError);
    expect(storage.keys()).toEqual(['signatures/id-1.png']);
  });

  it('deletes the new file and keeps the old signature when recording fails', async () => {
    await useCase.execute('user-1', PNG);
    repository.failNextSave = new Error('database down');

    await expect(useCase.execute('user-1', jpegHeader())).rejects.toThrow(
      'database down',
    );
    expect(storage.keys()).toEqual(['signatures/id-1.png']);
    expect((await repository.findByUserId('user-1'))?.storageKey).toBe(
      'signatures/id-1.png',
    );
  });
});
