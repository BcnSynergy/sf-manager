import { Logger } from '@nestjs/common';
import { FixedClock } from '../../../../shared/testing/fixed-clock';
import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { InMemoryReviewerSignatureRepository } from './testing/in-memory-reviewer-signature.repository';
import { SweepOrphanSignatureFilesUseCase } from './sweep-orphan-signature-files.use-case';

const NOW = new Date('2026-11-26T12:00:00.000Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

// reviewer-signature "Orphan Signature Files Are Swept" (EN-243). The sweep
// logic itself is shared with the review photo sweep and covered in depth
// there; these pin what this directory adds.
describe('SweepOrphanSignatureFilesUseCase', () => {
  let signatures: InMemoryReviewerSignatureRepository;
  let storage: InMemoryFileStorage;
  let useCase: SweepOrphanSignatureFilesUseCase;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  const storeFile = async (key: string, storedAt: Date) => {
    await storage.put(key, Buffer.from('png'));
    storage.setStoredAt(key, storedAt);
  };

  beforeEach(() => {
    signatures = new InMemoryReviewerSignatureRepository();
    storage = new InMemoryFileStorage();
    useCase = new SweepOrphanSignatureFilesUseCase(
      signatures,
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

  it("deletes an old file no user's signature references, keeping a referenced one however old and a recent one", async () => {
    await signatures.save('user-1', 'signatures/current.png');
    await storeFile('signatures/current.png', minutesAgo(60 * 24 * 365));
    await storeFile('signatures/replaced.png', minutesAgo(120));
    await storeFile('signatures/uploading.png', minutesAgo(10));

    await expect(useCase.execute()).resolves.toBe(1);

    expect(storage.keys()).toEqual([
      'signatures/current.png',
      'signatures/uploading.png',
    ]);
    expect(log).toHaveBeenCalledWith('Swept 1 orphan signature file(s)');
  });

  it('keeps the file a later upload saved and deletes the one it replaced', async () => {
    await storeFile('signatures/first.png', minutesAgo(180));
    await signatures.save('user-1', 'signatures/first.png');
    await storeFile('signatures/second.png', minutesAgo(120));
    await signatures.save('user-1', 'signatures/second.png');

    await expect(useCase.execute()).resolves.toBe(1);

    expect(storage.keys()).toEqual(['signatures/second.png']);
  });

  it('deletes nothing when no signature row exists, and warns', async () => {
    await storeFile('signatures/a.png', minutesAgo(120));

    await expect(useCase.execute()).resolves.toBe(0);

    expect(storage.keys()).toEqual(['signatures/a.png']);
    expect(warn).toHaveBeenCalledWith(
      'Skipped the orphan signature file sweep: 1 old file(s) but no signature row at all ' +
        '(is the API on the database restored with these files?)',
    );
  });

  it('only looks under signatures/', async () => {
    await signatures.save('user-1', 'signatures/current.png');
    await storeFile('review-signatures/s-1-a.png', minutesAgo(60 * 24 * 30));
    await storeFile('logos/old.png', minutesAgo(60 * 24 * 30));

    await expect(useCase.execute()).resolves.toBe(0);

    expect(storage.keys()).toEqual([
      'logos/old.png',
      'review-signatures/s-1-a.png',
    ]);
  });

  it('deletes unfinished writes under signatures/ started more than an hour ago, even with no signature row', async () => {
    storage.leaveUnfinishedWrite('signatures/old.png', minutesAgo(120));
    storage.leaveUnfinishedWrite('signatures/recent.png', minutesAgo(10));
    storage.leaveUnfinishedWrite(
      'review-signatures/s-1-a.png',
      minutesAgo(120),
    );

    await useCase.execute();

    expect(storage.unfinishedWriteKeys()).toEqual([
      'review-signatures/s-1-a.png',
      'signatures/recent.png',
    ]);
    expect(log).toHaveBeenCalledWith('Deleted 1 unfinished signature write(s)');
  });
});
