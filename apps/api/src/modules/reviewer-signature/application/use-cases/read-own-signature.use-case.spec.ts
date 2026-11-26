import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { webpLossyHeader } from '../../../organization-profile/domain/testing/logo-fixtures';
import { GetOwnSignatureStatusUseCase } from './get-own-signature-status.use-case';
import { ReadOwnSignatureImageUseCase } from './read-own-signature-image.use-case';
import { InMemoryReviewerSignatureRepository } from './testing/in-memory-reviewer-signature.repository';

const WEBP = webpLossyHeader();

describe('Own signature reads (reviewer-signature: status and image)', () => {
  let repository: InMemoryReviewerSignatureRepository;
  let storage: InMemoryFileStorage;

  beforeEach(() => {
    repository = new InMemoryReviewerSignatureRepository();
    storage = new InMemoryFileStorage();
  });

  describe('GetOwnSignatureStatusUseCase', () => {
    it('reports no signature for a user who never uploaded one', async () => {
      const useCase = new GetOwnSignatureStatusUseCase(repository);

      expect(await useCase.execute('user-1')).toEqual({
        hasSignature: false,
        updatedAt: null,
      });
    });

    it('reports the signature and its upload time', async () => {
      const saved = await repository.save('user-1', 'signatures/a.webp');
      const useCase = new GetOwnSignatureStatusUseCase(repository);

      expect(await useCase.execute('user-1')).toEqual({
        hasSignature: true,
        updatedAt: saved.updatedAt,
      });
    });
  });

  describe('ReadOwnSignatureImageUseCase', () => {
    it("returns the caller's bytes with the content type of their format", async () => {
      await storage.put('signatures/a.webp', WEBP);
      await repository.save('user-1', 'signatures/a.webp');
      const useCase = new ReadOwnSignatureImageUseCase(repository, storage);

      expect(await useCase.execute('user-1')).toEqual({
        content: WEBP,
        contentType: 'image/webp',
        extension: 'webp',
      });
    });

    // EN-112 pattern: a replacing upload records the new key and then deletes
    // the old file, so a read holding the old key can find its file gone.
    it('reads the key again when its file is gone and serves the new file once', async () => {
      await storage.put('signatures/b.webp', WEBP);
      const first = { userId: 'user-1', storageKey: 'signatures/a.webp' };
      const second = { userId: 'user-1', storageKey: 'signatures/b.webp' };
      const find = jest
        .spyOn(repository, 'findByUserId')
        .mockResolvedValueOnce({ ...first, updatedAt: new Date() })
        .mockResolvedValueOnce({ ...second, updatedAt: new Date() });
      const useCase = new ReadOwnSignatureImageUseCase(repository, storage);

      expect(await useCase.execute('user-1')).toEqual({
        content: WEBP,
        contentType: 'image/webp',
        extension: 'webp',
      });
      expect(find).toHaveBeenCalledTimes(2);
    });

    it('returns null when the key is unchanged on the second read', async () => {
      await repository.save('user-1', 'signatures/a.webp');
      const find = jest.spyOn(repository, 'findByUserId');
      const useCase = new ReadOwnSignatureImageUseCase(repository, storage);

      expect(await useCase.execute('user-1')).toBeNull();
      expect(find).toHaveBeenCalledTimes(2);
    });

    it('returns null without a signature', async () => {
      const useCase = new ReadOwnSignatureImageUseCase(repository, storage);

      expect(await useCase.execute('user-1')).toBeNull();
    });

    it('returns null when the recorded file is missing', async () => {
      await repository.save('user-1', 'signatures/a.webp');
      const useCase = new ReadOwnSignatureImageUseCase(repository, storage);

      expect(await useCase.execute('user-1')).toBeNull();
    });

    it("never returns another user's signature", async () => {
      await storage.put('signatures/a.webp', WEBP);
      await repository.save('user-1', 'signatures/a.webp');
      const useCase = new ReadOwnSignatureImageUseCase(repository, storage);

      expect(await useCase.execute('user-2')).toBeNull();
    });
  });
});
