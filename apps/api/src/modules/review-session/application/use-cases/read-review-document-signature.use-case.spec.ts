import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from './testing/fake-company-scope.checker';
import { FakeManagerCapabilityChecker } from './testing/fake-manager-capability.checker';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import { ReadReviewDocumentSignatureUseCase } from './read-review-document-signature.use-case';

// reviewer-signature T3, review-document "The Document Carries the Session
// Signature": the copy is reachable through a document exactly when the
// document itself is.
describe('ReadReviewDocumentSignatureUseCase', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const technician = {
    userId: 'user-1',
    role: 'MAINTENANCE_TECHNICIAN' as const,
  };

  let sessionRepository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let fileStorage: InMemoryFileStorage;
  let useCase: ReadReviewDocumentSignatureUseCase;

  function seedSession(
    status: 'completed' | 'draft',
    performedById = 'user-1',
    signatureStorageKey: string | null = null,
  ): void {
    sessionRepository.seed(
      new ReviewSession({
        id: 'session-1',
        communityId: 'community-1',
        templateId: 'template-1',
        performedById,
        status,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt:
          status === 'completed' ? new Date('2026-01-02T00:00:00.000Z') : null,
        signatureStorageKey,
        entries: [],
      }),
    );
  }

  beforeEach(() => {
    sessionRepository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    fileStorage = new InMemoryFileStorage();
    useCase = new ReadReviewDocumentSignatureUseCase(
      new ReviewHistoryAccessService(
        sessionRepository,
        scopeChecker,
        new FakeCompanyScopeChecker(),
        new FakeManagerCapabilityChecker(),
      ),
      fileStorage,
    );
  });

  it('returns the copy of a document the caller may open, typed by its extension', async () => {
    seedSession('completed', 'user-1', 'review-signatures/s-1.png');
    scopeChecker.assign('user-1', 'community-1');
    await fileStorage.put('review-signatures/s-1.png', png);

    await expect(useCase.execute('session-1', technician)).resolves.toEqual({
      content: png,
      contentType: 'image/png',
    });
  });

  it.each([
    ['jpg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ])('serves a .%s copy as %s', async (extension, contentType) => {
    const key = `review-signatures/s-1.${extension}`;
    seedSession('completed', 'user-1', key);
    scopeChecker.assign('user-1', 'community-1');
    await fileStorage.put(key, png);

    await expect(useCase.execute('session-1', technician)).resolves.toEqual({
      content: png,
      contentType,
    });
  });

  it('resolves null for a session signed before the signature existed', async () => {
    seedSession('completed');
    scopeChecker.assign('user-1', 'community-1');

    await expect(useCase.execute('session-1', technician)).resolves.toBeNull();
  });

  it('resolves null when the recorded copy is missing from storage', async () => {
    seedSession('completed', 'user-1', 'review-signatures/s-1.png');
    scopeChecker.assign('user-1', 'community-1');

    await expect(useCase.execute('session-1', technician)).resolves.toBeNull();
  });

  it.each([
    ['an unknown session', () => undefined],
    [
      'a session outside the caller scope',
      () => seedSession('completed', 'user-2', 'review-signatures/s-1.png'),
    ],
    [
      'a draft session',
      () => {
        seedSession('draft');
        scopeChecker.assign('user-1', 'community-1');
      },
    ],
  ])(
    'rejects %s without reading the file',
    async (_label, arrange: () => void) => {
      arrange();
      await fileStorage.put('review-signatures/s-1.png', png);
      const getSpy = jest.spyOn(fileStorage, 'get');

      await expect(useCase.execute('session-1', technician)).rejects.toThrow(
        ReviewSessionNotFoundError,
      );
      expect(getSpy).not.toHaveBeenCalled();
    },
  );
});
