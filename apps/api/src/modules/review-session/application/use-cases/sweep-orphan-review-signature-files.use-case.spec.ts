import { Logger } from '@nestjs/common';
import { FixedClock } from '../../../../shared/testing/fixed-clock';
import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { ReviewSession } from '../../domain/review-session.entity';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { SweepOrphanReviewSignatureFilesUseCase } from './sweep-orphan-review-signature-files.use-case';

const NOW = new Date('2026-11-26T12:00:00.000Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

// review-session-management "Orphan Photo and Signature Files Are Swept"
// (EN-244). The sweep logic itself is shared with the photo sweep and
// covered in depth there; these pin what this directory adds.
describe('SweepOrphanReviewSignatureFilesUseCase', () => {
  let sessions: InMemoryReviewSessionRepository;
  let storage: InMemoryFileStorage;
  let useCase: SweepOrphanReviewSignatureFilesUseCase;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  const storeFile = async (key: string, storedAt: Date) => {
    await storage.put(key, Buffer.from('png'));
    storage.setStoredAt(key, storedAt);
  };

  const seedSession = (id: string, signatureStorageKey: string | null) => {
    sessions.seed(
      new ReviewSession({
        id,
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: 'user-1',
        status: signatureStorageKey ? 'completed' : 'draft',
        startedAt: minutesAgo(60 * 24 * 366),
        completedAt: signatureStorageKey ? minutesAgo(60 * 24 * 365) : null,
        signatureStorageKey,
      }),
    );
  };

  beforeEach(() => {
    sessions = new InMemoryReviewSessionRepository();
    storage = new InMemoryFileStorage();
    useCase = new SweepOrphanReviewSignatureFilesUseCase(
      sessions,
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

  it('deletes an old copy no session references, keeping a referenced one however old and a recent one', async () => {
    seedSession('session-1', 'review-signatures/session-1-a.png');
    await storeFile(
      'review-signatures/session-1-a.png',
      minutesAgo(60 * 24 * 365),
    );
    await storeFile('review-signatures/session-2-b.png', minutesAgo(120));
    await storeFile('review-signatures/session-3-c.png', minutesAgo(10));

    await expect(useCase.execute()).resolves.toBe(1);

    expect(storage.keys()).toEqual([
      'review-signatures/session-1-a.png',
      'review-signatures/session-3-c.png',
    ]);
    expect(log).toHaveBeenCalledWith('Swept 1 orphan review signature file(s)');
  });

  it('deletes nothing when no session has a signature copy, and warns', async () => {
    seedSession('draft-1', null);
    await storeFile('review-signatures/session-2-b.png', minutesAgo(120));

    await expect(useCase.execute()).resolves.toBe(0);

    expect(storage.keys()).toEqual(['review-signatures/session-2-b.png']);
    expect(warn).toHaveBeenCalledWith(
      'Skipped the orphan review signature file sweep: 1 old file(s) but no signed session row at all ' +
        '(is the API on the database restored with these files?)',
    );
  });

  it('only looks under review-signatures/', async () => {
    seedSession('session-1', 'review-signatures/session-1-a.png');
    await storeFile('signatures/old.png', minutesAgo(60 * 24 * 30));
    await storeFile('review-photos/old.jpg', minutesAgo(60 * 24 * 30));

    await expect(useCase.execute()).resolves.toBe(0);

    expect(storage.keys()).toEqual([
      'review-photos/old.jpg',
      'signatures/old.png',
    ]);
  });

  it('deletes unfinished writes under review-signatures/ started more than an hour ago, even with no signed session', async () => {
    storage.leaveUnfinishedWrite(
      'review-signatures/session-2-b.png',
      minutesAgo(120),
    );
    storage.leaveUnfinishedWrite(
      'review-signatures/session-3-c.png',
      minutesAgo(10),
    );
    storage.leaveUnfinishedWrite('review-photos/old.jpg', minutesAgo(120));

    await useCase.execute();

    expect(storage.unfinishedWriteKeys()).toEqual([
      'review-photos/old.jpg',
      'review-signatures/session-3-c.png',
    ]);
    expect(log).toHaveBeenCalledWith(
      'Deleted 1 unfinished review signature write(s)',
    );
  });

  it('keeps the copy a completion records', async () => {
    seedSession('draft-1', null);
    sessions.seed(
      new ReviewSession({
        id: 'draft-2',
        communityId: 'community-1',
        templateId: 'template-1',
        performedById: 'user-1',
        status: 'draft',
        startedAt: minutesAgo(180),
        completedAt: null,
      }),
    );
    await storeFile('review-signatures/draft-2-x.png', minutesAgo(120));
    await sessions.complete(
      'draft-2',
      minutesAgo(119),
      'review-signatures/draft-2-x.png',
    );

    await expect(useCase.execute()).resolves.toBe(0);

    expect(storage.keys()).toEqual(['review-signatures/draft-2-x.png']);
  });
});
