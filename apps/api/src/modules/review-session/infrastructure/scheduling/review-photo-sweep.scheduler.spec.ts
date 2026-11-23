import { Logger } from '@nestjs/common';
import type { SweepOrphanReviewPhotoFilesUseCase } from '../../application/use-cases/sweep-orphan-review-photo-files.use-case';
import {
  REVIEW_PHOTO_SWEEP_FIRST_DELAY_MS,
  REVIEW_PHOTO_SWEEP_INTERVAL_MS,
  ReviewPhotoSweepScheduler,
} from './review-photo-sweep.scheduler';

// review-session-management "Orphan Photo Files Are Swept" (EN-222): a few
// minutes after start-up, then every 24 hours; a failed sweep never stops
// the next one.
describe('ReviewPhotoSweepScheduler', () => {
  let execute: jest.Mock;
  let scheduler: ReviewPhotoSweepScheduler;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    execute = jest.fn().mockResolvedValue(0);
    scheduler = new ReviewPhotoSweepScheduler({
      execute,
    } as unknown as SweepOrphanReviewPhotoFilesUseCase);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('waits a few minutes after start-up before the first sweep, then sweeps every 24 hours', async () => {
    expect(REVIEW_PHOTO_SWEEP_FIRST_DELAY_MS).toBe(5 * 60 * 1000);
    expect(REVIEW_PHOTO_SWEEP_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);

    scheduler.onApplicationBootstrap();
    expect(execute).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(REVIEW_PHOTO_SWEEP_FIRST_DELAY_MS - 1);
    expect(execute).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(REVIEW_PHOTO_SWEEP_INTERVAL_MS - 1);
    expect(execute).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('logs a failed sweep and still runs the next one', async () => {
    execute.mockRejectedValueOnce(new Error('database down'));
    scheduler.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(REVIEW_PHOTO_SWEEP_FIRST_DELAY_MS);
    expect(error).toHaveBeenCalledWith(
      'Orphan review photo file sweep failed: database down',
    );

    await jest.advanceTimersByTimeAsync(REVIEW_PHOTO_SWEEP_INTERVAL_MS);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('runs no sweep after shutdown', async () => {
    scheduler.onApplicationBootstrap();
    scheduler.onApplicationShutdown();

    await jest.advanceTimersByTimeAsync(REVIEW_PHOTO_SWEEP_INTERVAL_MS * 2);

    expect(execute).not.toHaveBeenCalled();
  });

  it('does not keep the process alive', () => {
    scheduler.onApplicationBootstrap();

    expect(jest.getTimerCount()).toBe(1);
    expect(scheduler.hasRefedTimer()).toBe(false);
  });
});
