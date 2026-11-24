import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import { SessionAccessService } from '../services/session-access.service';
import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { InMemoryReviewPhotoRepository } from './testing/in-memory-review-photo.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { DiscardReviewSessionUseCase } from './discard-review-session.use-case';

function session(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return new ReviewSession({
    id: 'session-1',
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status: 'draft',
    startedAt: new Date('2026-09-07T00:00:00.000Z'),
    completedAt: null,
    ...overrides,
  });
}

// spec.md "Discard a Draft Session": hard delete via discardDraftWithPhotoKeys
// (WHERE status='draft'); false => 409 REVIEW_SESSION_NOT_EDITABLE. Only the
// opener, in scope, may discard (SessionAccess).
describe('DiscardReviewSessionUseCase', () => {
  let repository: InMemoryReviewSessionRepository;
  let photos: InMemoryReviewPhotoRepository;
  let files: InMemoryFileStorage;
  let scopeChecker: FakeCommunityScopeChecker;
  let sessionAccess: SessionAccessService;
  let useCase: DiscardReviewSessionUseCase;

  beforeEach(() => {
    repository = new InMemoryReviewSessionRepository();
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(repository, scopeChecker);
    photos = new InMemoryReviewPhotoRepository(repository);
    files = new InMemoryFileStorage();
    useCase = new DiscardReviewSessionUseCase(sessionAccess, photos, files);
  });

  it('discards a draft session and removes it from the repository', async () => {
    repository.seed(session());
    scopeChecker.assign('user-1', 'community-1');

    await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    await expect(
      repository.findByIdForPerformer('session-1', 'user-1'),
    ).resolves.toBeNull();
  });

  // EN-164 S4: discarding a draft deletes its photos, files included.
  it('deletes the photo files of the discarded draft and keeps other sessions files', async () => {
    repository.seed(session());
    repository.seed(session({ id: 'session-2', performedById: 'user-2' }));
    scopeChecker.assign('user-1', 'community-1');
    for (const [id, sessionId] of [
      ['a', 'session-1'],
      ['b', 'session-1'],
      ['c', 'session-2'],
    ]) {
      await files.put(`review-photos/${id}.jpg`, Buffer.from('x'));
      photos.seed({
        id,
        reviewSessionId: sessionId,
        inspectableElementId: 'element-1',
        storageKey: `review-photos/${id}.jpg`,
        sizeBytes: 1,
        createdAt: new Date(),
      });
    }

    await useCase.execute('session-1', {
      userId: 'user-1',
      role: 'MAINTENANCE_TECHNICIAN',
    });

    expect(files.keys()).toEqual(['review-photos/c.jpg']);
    expect(photos.all().map((photo) => photo.id)).toEqual(['c']);
  });

  it('keeps the photo files when the session is not a draft', async () => {
    repository.seed(session({ status: 'completed', completedAt: new Date() }));
    scopeChecker.assign('user-1', 'community-1');
    await files.put('review-photos/a.jpg', Buffer.from('x'));
    photos.seed({
      id: 'a',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-1',
      storageKey: 'review-photos/a.jpg',
      sizeBytes: 1,
      createdAt: new Date(),
    });

    await expect(
      useCase.execute('session-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toBeInstanceOf(ReviewSessionNotEditableError);

    expect(files.keys()).toEqual(['review-photos/a.jpg']);
  });

  it('still discards when a photo file cannot be deleted (logged, not thrown)', async () => {
    repository.seed(session());
    scopeChecker.assign('user-1', 'community-1');
    photos.seed({
      id: 'a',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-1',
      storageKey: 'review-photos/a.jpg',
      sizeBytes: 1,
      createdAt: new Date(),
    });
    jest.spyOn(files, 'delete').mockRejectedValueOnce(new Error('disk gone'));

    await expect(
      useCase.execute('session-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.findByIdForPerformer('session-1', 'user-1'),
    ).resolves.toBeNull();
  });

  it('rejects discarding a completed session with ReviewSessionNotEditableError', async () => {
    repository.seed(session({ status: 'completed', completedAt: new Date() }));
    scopeChecker.assign('user-1', 'community-1');

    await expect(
      useCase.execute('session-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotEditableError);
  });

  it('rejects an out-of-scope session with ReviewSessionNotFoundError', async () => {
    repository.seed(session());
    // Not assigned via scopeChecker.

    await expect(
      useCase.execute('session-1', {
        userId: 'user-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(ReviewSessionNotFoundError);
  });
});
