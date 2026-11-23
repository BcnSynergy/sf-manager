import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SweepOrphanReviewPhotoFilesUseCase } from '../../application/use-cases/sweep-orphan-review-photo-files.use-case';

export const REVIEW_PHOTO_SWEEP_FIRST_DELAY_MS = 5 * 60 * 1000;
export const REVIEW_PHOTO_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// review-session-management "Orphan Photo Files Are Swept" (EN-222): runs
// the sweep a few minutes after start-up, so it never delays the boot or the
// first requests, then every 24 hours. Each run is scheduled only after the
// previous one settled, so two never overlap. A failed run is logged and the
// next one still happens. The timer is unref'd, so it never keeps the
// process (or a test run) alive, and shutdown cancels it. One API instance
// runs in production; with several, each would sweep, which is harmless.
@Injectable()
export class ReviewPhotoSweepScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReviewPhotoSweepScheduler.name);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly sweep: SweepOrphanReviewPhotoFilesUseCase) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(REVIEW_PHOTO_SWEEP_FIRST_DELAY_MS);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  // For the test that pins the unref'd timer.
  hasRefedTimer(): boolean {
    return this.timer?.hasRef() ?? false;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.run(), delayMs);
    this.timer.unref();
  }

  private async run(): Promise<void> {
    try {
      await this.sweep.execute();
    } catch (error) {
      this.logger.error(
        `Orphan review photo file sweep failed: ${(error as Error).message}`,
      );
    }
    this.schedule(REVIEW_PHOTO_SWEEP_INTERVAL_MS);
  }
}
