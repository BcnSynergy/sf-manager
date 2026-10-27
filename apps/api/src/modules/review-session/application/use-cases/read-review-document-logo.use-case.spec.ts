import { InMemoryOrganizationProfileRepository } from '../../../organization-profile/application/use-cases/testing/in-memory-organization-profile.repository';
import { GetOrganizationLogoUseCase } from '../../../organization-profile/application/use-cases/get-organization-logo.use-case';
import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from './testing/fake-company-scope.checker';
import { FakeManagerCapabilityChecker } from './testing/fake-manager-capability.checker';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import { ReadReviewDocumentLogoUseCase } from './read-review-document-logo.use-case';

// organization-logo S8, review-document "The Document Carries the
// Organization Logo": the logo is reachable through a document exactly when
// the document itself is.
describe('ReadReviewDocumentLogoUseCase', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const technician = {
    userId: 'user-1',
    role: 'MAINTENANCE_TECHNICIAN' as const,
  };

  let sessionRepository: InMemoryReviewSessionRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let profileRepository: InMemoryOrganizationProfileRepository;
  let fileStorage: InMemoryFileStorage;
  let logoReader: GetOrganizationLogoUseCase;
  let useCase: ReadReviewDocumentLogoUseCase;

  function seedSession(
    status: 'completed' | 'draft',
    performedById = 'user-1',
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
        entries: [],
      }),
    );
  }

  async function seedLogo(): Promise<void> {
    await fileStorage.put('logos/logo-1.png', png);
    await profileRepository.setLogoAssetId('logos/logo-1.png');
  }

  beforeEach(() => {
    sessionRepository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    profileRepository = new InMemoryOrganizationProfileRepository();
    fileStorage = new InMemoryFileStorage();
    logoReader = new GetOrganizationLogoUseCase(profileRepository, fileStorage);
    useCase = new ReadReviewDocumentLogoUseCase(
      new ReviewHistoryAccessService(
        sessionRepository,
        scopeChecker,
        new FakeCompanyScopeChecker(),
        new FakeManagerCapabilityChecker(),
      ),
      logoReader,
    );
  });

  it('returns the logo of a document the caller may open', async () => {
    seedSession('completed');
    scopeChecker.assign('user-1', 'community-1');
    await seedLogo();

    await expect(useCase.execute('session-1', technician)).resolves.toEqual({
      content: png,
      contentType: 'image/png',
    });
  });

  it('resolves null when the organization has no logo', async () => {
    seedSession('completed');
    scopeChecker.assign('user-1', 'community-1');

    await expect(useCase.execute('session-1', technician)).resolves.toBeNull();
  });

  it.each([
    ['an unknown session', () => undefined],
    [
      'a session outside the caller scope',
      () => seedSession('completed', 'user-2'),
    ],
    [
      'a draft session',
      () => {
        seedSession('draft');
        scopeChecker.assign('user-1', 'community-1');
      },
    ],
  ])(
    'rejects %s without reading the logo',
    async (_label, arrange: () => void) => {
      arrange();
      await seedLogo();
      const readSpy = jest.spyOn(logoReader, 'execute');

      await expect(useCase.execute('session-1', technician)).rejects.toThrow(
        ReviewSessionNotFoundError,
      );
      expect(readSpy).not.toHaveBeenCalled();
    },
  );
});
