import { Logger } from '@nestjs/common';
import type { SweepOrphanReviewPhotoFilesUseCase } from '../../application/use-cases/sweep-orphan-review-photo-files.use-case';
import type { SweepOrphanReviewSignatureFilesUseCase } from '../../application/use-cases/sweep-orphan-review-signature-files.use-case';
import {
  REVIEW_FILE_SWEEP_FIRST_DELAY_MS,
  REVIEW_FILE_SWEEP_INTERVAL_MS,
  ReviewFileSweepScheduler,
} from './review-file-sweep.scheduler';

// review-session-management "Orphan Photo and Signature Files Are Swept"
// (EN-222, EN-244): a few minutes after start-up, then every 24 hours; a
// failed sweep never stops the other sweep or the next run.
describe('ReviewFileSweepScheduler', () => {
  let photoSweep: jest.Mock;
  let signatureSweep: jest.Mock;
  let scheduler: ReviewFileSweepScheduler;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    photoSweep = jest.fn().mockResolvedValue(0);
    signatureSweep = jest.fn().mockResolvedValue(0);
    scheduler = new ReviewFileSweepScheduler(
      { execute: photoSweep } as unknown as SweepOrphanReviewPhotoFilesUseCase,
      {
        execute: signatureSweep,
      } as unknown as SweepOrphanReviewSignatureFilesUseCase,
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
    expect(signatureSweep).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS - 1);
    expect(photoSweep).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(photoSweep).toHaveBeenCalledTimes(2);
    expect(signatureSweep).toHaveBeenCalledTimes(2);
  });

  it('runs the signature sweep only after the photo sweep settled', async () => {
    let finish: (deleted: number) => void = () => undefined;
    photoSweep.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);
    expect(signatureSweep).not.toHaveBeenCalled();

    finish(0);
    await jest.advanceTimersByTimeAsync(0);
    expect(signatureSweep).toHaveBeenCalledTimes(1);
  });

  it('logs a failed photo sweep and still runs the signature sweep and the next run', async () => {
    photoSweep.mockRejectedValueOnce(new Error('database down'));
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);
    expect(error).toHaveBeenCalledWith(
      'Orphan review photo file sweep failed: database down',
    );
    expect(signatureSweep).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS);
    expect(photoSweep).toHaveBeenCalledTimes(2);
  });

  it('logs a failed signature sweep and still runs the next run', async () => {
    signatureSweep.mockRejectedValueOnce(new Error('disk gone'));
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);
    expect(error).toHaveBeenCalledWith(
      'Orphan review signature file sweep failed: disk gone',
    );

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS);
    expect(signatureSweep).toHaveBeenCalledTimes(2);
  });

  it('runs no sweep after shutdown', async () => {
    scheduler.onApplicationBootstrap();
    scheduler.onApplicationShutdown();

    await jest.advanceTimersByTimeAsync(REVIEW_FILE_SWEEP_INTERVAL_MS * 2);

    expect(photoSweep).not.toHaveBeenCalled();
    expect(signatureSweep).not.toHaveBeenCalled();
  });

  it('does not keep the process alive', () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    scheduler.onApplicationBootstrap();

    const timer = setTimeoutSpy.mock.results[0].value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
  });

  it('never starts a run while the previous one is still running', async () => {
    signatureSweep.mockReturnValueOnce(new Promise(() => undefined));
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(
      REVIEW_FILE_SWEEP_FIRST_DELAY_MS + REVIEW_FILE_SWEEP_INTERVAL_MS * 3,
    );

    expect(photoSweep).toHaveBeenCalledTimes(1);
    expect(signatureSweep).toHaveBeenCalledTimes(1);
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

    expect(signatureSweep).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
