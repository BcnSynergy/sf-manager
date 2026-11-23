import { Logger } from '@nestjs/common';
import { FixedClock } from '../../../../shared/testing/fixed-clock';
import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { ReviewSession } from '../../domain/review-session.entity';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { InMemoryReviewPhotoRepository } from './testing/in-memory-review-photo.repository';
import { SweepOrphanReviewPhotoFilesUseCase } from './sweep-orphan-review-photo-files.use-case';

const NOW = new Date('2026-11-23T12:00:00.000Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

// review-session-management "Orphan Photo Files Are Swept" (EN-222).
describe('SweepOrphanReviewPhotoFilesUseCase', () => {
  let sessions: InMemoryReviewSessionRepository;
  let photos: InMemoryReviewPhotoRepository;
  let storage: InMemoryFileStorage;
  let useCase: SweepOrphanReviewPhotoFilesUseCase;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  const storeFile = async (key: string, storedAt: Date) => {
    await storage.put(key, Buffer.from('jpeg'));
    storage.setStoredAt(key, storedAt);
  };

  const seedPhoto = (sessionId: string, photoId: string) => {
    photos.seed({
      id: photoId,
      reviewSessionId: sessionId,
      inspectableElementId: 'element-1',
      storageKey: `review-photos/${photoId}.jpg`,
      sizeBytes: 4,
      createdAt: minutesAgo(60 * 24 * 365),
    });
  };

  beforeEach(() => {
    sessions = new InMemoryReviewSessionRepository();
    sessions.seed(
      new ReviewSession({
        id: 'session-1',
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: 'user-1',
        status: 'completed',
        startedAt: minutesAgo(60 * 24 * 366),
        completedAt: minutesAgo(60 * 24 * 365),
      }),
    );
    photos = new InMemoryReviewPhotoRepository(sessions);
    storage = new InMemoryFileStorage();
    useCase = new SweepOrphanReviewPhotoFilesUseCase(
      photos,
      storage,
      new FixedClock(NOW),
    );
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes an old file no row references and reports the count', async () => {
    await storeFile('review-photos/orphan.jpg', minutesAgo(120));

    await expect(useCase.execute()).resolves.toBe(1);

    expect(storage.keys()).toEqual([]);
    expect(log).toHaveBeenCalledWith('Swept 1 orphan review photo file(s)');
  });

  it('keeps a file with no row stored less than an hour ago (upload in progress)', async () => {
    await storeFile('review-photos/uploading.jpg', minutesAgo(10));
    await storeFile('review-photos/almost.jpg', minutesAgo(60));

    await expect(useCase.execute()).resolves.toBe(0);

    expect(storage.keys()).toEqual([
      'review-photos/almost.jpg',
      'review-photos/uploading.jpg',
    ]);
  });

  it('never deletes a file a row references, however old', async () => {
    seedPhoto('session-1', 'kept');
    await storeFile('review-photos/kept.jpg', minutesAgo(60 * 24 * 365));
    await storeFile('review-photos/orphan.jpg', minutesAgo(120));

    await expect(useCase.execute()).resolves.toBe(1);

    expect(storage.keys()).toEqual(['review-photos/kept.jpg']);
  });

  it('only looks under review-photos/', async () => {
    await storeFile('logos/old.png', minutesAgo(60 * 24 * 30));

    await expect(useCase.execute()).resolves.toBe(0);

    expect(storage.keys()).toEqual(['logos/old.png']);
  });

  it('logs a file it cannot delete and still deletes the others', async () => {
    class OneFailingDelete extends InMemoryFileStorage {
      delete(key: string): Promise<void> {
        return key === 'review-photos/a.jpg'
          ? Promise.reject(new Error('disk busy'))
          : super.delete(key);
      }
    }
    storage = new OneFailingDelete();
    useCase = new SweepOrphanReviewPhotoFilesUseCase(
      photos,
      storage,
      new FixedClock(NOW),
    );
    await storeFile('review-photos/a.jpg', minutesAgo(120));
    await storeFile('review-photos/b.jpg', minutesAgo(120));

    await expect(useCase.execute()).resolves.toBe(1);

    expect(storage.keys()).toEqual(['review-photos/a.jpg']);
    expect(warn).toHaveBeenCalledWith(
      'Could not delete orphan review photo file review-photos/a.jpg: disk busy',
    );
  });
});
