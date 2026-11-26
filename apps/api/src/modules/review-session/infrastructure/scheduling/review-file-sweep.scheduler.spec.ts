import { Logger } from '@nestjs/common';
import type { SweepOrphanReviewPhotoFilesUseCase } from '../../application/use-cases/sweep-orphan-review-photo-files.use-case';
import type { SweepOrphanReviewSignatureFilesUseCase } from '../../application/use-cases/sweep-orphan-review-signature-files.use-case';
import type { SweepOrphanSignatureFilesUseCase } from '../../../reviewer-signature/application/use-cases/sweep-orphan-signature-files.use-case';
import {
  REVIEW_FILE_SWEEP_FIRST_DELAY_MS,
  REVIEW_FILE_SWEEP_INTERVAL_MS,
  ReviewFileSweepScheduler,
} from './review-file-sweep.scheduler';

// review-session-management "Orphan Photo and Signature Files Are Swept"
// (EN-222, EN-244) and reviewer-signature "Orphan Signature Files Are Swept"
// (EN-243): a few minutes after start-up, then every 24 hours; a failed
// sweep never stops the other sweeps or the next run.
describe('ReviewFileSweepScheduler', () => {
  let photoSweep: jest.Mock;
  let copySweep: jest.Mock;
  let ownSweep: jest.Mock;
  let scheduler: ReviewFileSweepScheduler;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    photoSweep = jest.fn().mockResolvedValue(0);
    copySweep = jest.fn().mockResolvedValue(0);
    ownSweep = jest.fn().mockResolvedValue(0);
    scheduler = new ReviewFileSweepScheduler(
      { execute: photoSweep } as unknown as SweepOrphanReviewPhotoFilesUseCase,
      {
        execute: copySweep,
      } as unknown as SweepOrphanReviewSignatureFilesUseCase,
      { execute: ownSweep } as unknown as SweepOrphanSignatureFilesUseCase,
    );
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('waits a few minutes after start-up before the first run, then runs every 24 hours', async () => {
    expect(REVIEW_FILE_SWEEP_FIRST_DELAY_MS).toBe(5 * 60 * 1000);
    expect(REVIEW_FILE_SWEEP_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);

    scheduler.onApplicationBootstrap();
    expect(photoSweep).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS - 1);
    expect(photoSweep).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(photoSweep).toHaveBeenCalledTimes(1);
    expect(copySweep).toHaveBeenCalledTimes(1);
    expect(ownSweep).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS - 1);
    expect(photoSweep).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(photoSweep).toHaveBeenCalledTimes(2);
    expect(copySweep).toHaveBeenCalledTimes(2);
    expect(ownSweep).toHaveBeenCalledTimes(2);
  });

  it('runs the sweeps one after the other, each only after the previous one settled', async () => {
    let finish: (deleted: number) => void = () => undefined;
    let finishCopy: (deleted: number) => void = () => undefined;
    photoSweep.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    copySweep.mockReturnValueOnce(
      new Promise((resolve) => (finishCopy = resolve)),
    );
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);
    expect(copySweep).not.toHaveBeenCalled();

    finish(0);
    await jest.advanceTimersByTimeAsync(0);
    expect(copySweep).toHaveBeenCalledTimes(1);
    expect(ownSweep).not.toHaveBeenCalled();

    finishCopy(0);
    await jest.advanceTimersByTimeAsync(0);
    expect(ownSweep).toHaveBeenCalledTimes(1);
  });

  it('logs a failed photo sweep and still runs the other sweeps and the next run', async () => {
    photoSweep.mockRejectedValueOnce(new Error('database down'));
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);
    expect(error).toHaveBeenCalledWith(
      'Orphan review photo file sweep failed: database down',
    );
    expect(copySweep).toHaveBeenCalledTimes(1);
    expect(ownSweep).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS);
    expect(photoSweep).toHaveBeenCalledTimes(2);
  });

  it('logs a failed signature copy sweep and still runs the own signature sweep and the next run', async () => {
    copySweep.mockRejectedValueOnce(new Error('disk gone'));
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);
    expect(error).toHaveBeenCalledWith(
      'Orphan review signature file sweep failed: disk gone',
    );
    expect(ownSweep).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS);
    expect(copySweep).toHaveBeenCalledTimes(2);
  });

  it('logs a failed own signature sweep and still runs the next run', async () => {
    ownSweep.mockRejectedValueOnce(new Error('disk gone'));
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);
    expect(error).toHaveBeenCalledWith(
      'Orphan signature file sweep failed: disk gone',
    );

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS);
    expect(ownSweep).toHaveBeenCalledTimes(2);
  });

  it('runs no sweep after shutdown', async () => {
    scheduler.onApplicationBootstrap();
    scheduler.onApplicationShutdown();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS * 2);

    expect(photoSweep).not.toHaveBeenCalled();
    expect(copySweep).not.toHaveBeenCalled();
    expect(ownSweep).not.toHaveBeenCalled();
  });

  it('does not keep the process alive', () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    scheduler.onApplicationBootstrap();

    const timer = setTimeoutSpy.mock.results[0].value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
  });

  it('never starts a run while the previous one is still running', async () => {
    ownSweep.mockReturnValueOnce(new Promise(() => undefined));
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(
      REVIEW_FILE_SWEEP_FIRST_DELAY_MS + REVIEW_FILE_SWEEP_INTERVAL_MS * 3,
    );

    expect(photoSweep).toHaveBeenCalledTimes(1);
    expect(ownSweep).toHaveBeenCalledTimes(1);
  });

  it('starts no further sweep and schedules nothing more when shut down during a run', async () => {
    let finish: (deleted: number) => void = () => undefined;
    photoSweep.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);

    scheduler.onApplicationShutdown();
    finish(0);
    await jest.advanceTimersByTimeAsync(0);

    expect(copySweep).not.toHaveBeenCalled();
    expect(ownSweep).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
