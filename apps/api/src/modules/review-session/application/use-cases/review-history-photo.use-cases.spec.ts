import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { jpegHeader } from '../../../organization-profile/domain/testing/logo-fixtures';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { ReviewPhotoNotFoundError } from '../../domain/errors/review-photo.errors';
import type { ReviewPhoto } from '../../domain/review-photo';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { InMemoryReviewPhotoRepository } from './testing/in-memory-review-photo.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { FakeCompanyScopeChecker } from './testing/fake-company-scope.checker';
import { FakeManagerCapabilityChecker } from './testing/fake-manager-capability.checker';
import { ListReviewHistoryPhotosUseCase } from './list-review-history-photos.use-case';
import { ReadReviewHistoryPhotoUseCase } from './read-review-history-photo.use-case';

const performer = { userId: 'user-1', role: 'MAINTENANCE_TECHNICIAN' as const };
const representative = {
  userId: 'rep-1',
  role: 'COMMUNITY_REPRESENTATIVE' as const,
};
const outsider = { userId: 'user-2', role: 'MAINTENANCE_TECHNICIAN' as const };

function session(
  id: string,
  status: 'draft' | 'completed' = 'completed',
): ReviewSession {
  return new ReviewSession({
    id,
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt:
      status === 'completed' ? new Date('2026-01-02T00:00:00.000Z') : null,
    entries: [],
  });
}

function photo(
  id: string,
  reviewSessionId: string,
  inspectableElementId: string,
  createdAt: string,
): ReviewPhoto {
  return {
    id,
    reviewSessionId,
    inspectableElementId,
    storageKey: `review-photos/${id}.jpg`,
    sizeBytes: jpegHeader().length,
    createdAt: new Date(createdAt),
  };
}

// EN-164 S3/S5 (T3): a completed review's photos are readable by exactly
// whoever may read that review in the history, through the same gate
// (ReviewHistoryAccessService.loadCompletedForActor) as the detail read.
describe('review history photo use cases', () => {
  let sessions: InMemoryReviewSessionRepository;
  let photos: InMemoryReviewPhotoRepository;
  let files: InMemoryFileStorage;
  let scope: FakeCommunityScopeChecker;
  let list: ListReviewHistoryPhotosUseCase;
  let read: ReadReviewHistoryPhotoUseCase;

  beforeEach(async () => {
    sessions = new InMemoryReviewSessionRepository();
    photos = new InMemoryReviewPhotoRepository(sessions);
    files = new InMemoryFileStorage();
    scope = new FakeCommunityScopeChecker();
    const access = new ReviewHistoryAccessService(
      sessions,
      scope,
      new FakeCompanyScopeChecker(),
      new FakeManagerCapabilityChecker(),
    );
    list = new ListReviewHistoryPhotosUseCase(access, photos);
    read = new ReadReviewHistoryPhotoUseCase(access, photos, files);

    sessions.seed(session('session-1'));
    sessions.seed(session('session-2'));
    sessions.seed(session('draft-1', 'draft'));
    for (const seeded of [
      photo('photo-2', 'session-1', 'element-b', '2026-01-01T10:00:00.000Z'),
      photo('photo-1', 'session-1', 'element-a', '2026-01-01T09:00:00.000Z'),
      photo('photo-3', 'session-2', 'element-a', '2026-01-01T08:00:00.000Z'),
      photo('photo-4', 'draft-1', 'element-a', '2026-01-01T08:00:00.000Z'),
    ]) {
      photos.seed(seeded);
      await files.put(seeded.storageKey, jpegHeader());
    }
  });

  describe('list', () => {
    it('returns every photo of the session, oldest first, with its element and no storage key', async () => {
      await expect(list.execute('session-1', performer)).resolves.toEqual([
        {
          id: 'photo-1',
          inspectableElementId: 'element-a',
          createdAt: new Date('2026-01-01T09:00:00.000Z'),
        },
        {
          id: 'photo-2',
          inspectableElementId: 'element-b',
          createdAt: new Date('2026-01-01T10:00:00.000Z'),
        },
      ]);
    });

    it('returns them to a representative assigned to the community', async () => {
      scope.assign('rep-1', 'community-1');

      const listed = await list.execute('session-1', representative);

      expect(listed.map((row) => row.id)).toEqual(['photo-1', 'photo-2']);
    });

    it('returns an empty list for a completed session without photos', async () => {
      sessions.seed(session('session-3'));

      await expect(list.execute('session-3', performer)).resolves.toEqual([]);
    });

    it('rejects a caller outside the history scope, a draft and an unknown session with ReviewSessionNotFoundError', async () => {
      await expect(list.execute('session-1', outsider)).rejects.toBeInstanceOf(
        ReviewSessionNotFoundError,
      );
      await expect(
        list.execute('session-1', representative),
      ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);
      await expect(list.execute('draft-1', performer)).rejects.toBeInstanceOf(
        ReviewSessionNotFoundError,
      );
      await expect(list.execute('missing', performer)).rejects.toBeInstanceOf(
        ReviewSessionNotFoundError,
      );
    });
  });

  describe('read', () => {
    it('returns the bytes of a photo of the session', async () => {
      await expect(
        read.execute('session-1', 'photo-1', performer),
      ).resolves.toEqual(jpegHeader());
    });

    it('returns the bytes to a representative assigned to the community, who did not perform the session', async () => {
      scope.assign('rep-1', 'community-1');

      await expect(
        read.execute('session-1', 'photo-1', representative),
      ).resolves.toEqual(jpegHeader());
    });

    it('rejects a caller outside the history scope and a draft with ReviewSessionNotFoundError, before reading any file', async () => {
      const get = jest.spyOn(files, 'get');

      await expect(
        read.execute('session-1', 'photo-1', outsider),
      ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);
      await expect(
        read.execute('draft-1', 'photo-4', performer),
      ).rejects.toBeInstanceOf(ReviewSessionNotFoundError);
      expect(get).not.toHaveBeenCalled();
    });

    it('rejects a photo of another session, an unknown photo and a missing file with ReviewPhotoNotFoundError', async () => {
      await expect(
        read.execute('session-1', 'photo-3', performer),
      ).rejects.toBeInstanceOf(ReviewPhotoNotFoundError);
      await expect(
        read.execute('session-1', 'missing', performer),
      ).rejects.toBeInstanceOf(ReviewPhotoNotFoundError);

      await files.delete('review-photos/photo-2.jpg');
      await expect(
        read.execute('session-1', 'photo-2', performer),
      ).rejects.toBeInstanceOf(ReviewPhotoNotFoundError);
    });
  });
});
