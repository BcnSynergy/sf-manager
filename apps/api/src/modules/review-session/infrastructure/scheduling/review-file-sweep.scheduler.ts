import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { SweepOrphanReviewPhotoFilesUseCase } from '../../application/use-cases/sweep-orphan-review-photo-files.use-case';
import { SweepOrphanReviewSignatureFilesUseCase } from '../../application/use-cases/sweep-orphan-review-signature-files.use-case';

export const REVIEW_FILE_SWEEP_FIRST_DELAY_MS = 5 * 60 * 1000;
export const REVIEW_FILE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// review-session-management "Orphan Photo and Signature Files Are Swept"
// (EN-222, EN-244): runs the orphan file sweeps a few minutes after start-up,
// so they never delay the boot or the first requests, then every 24 hours.
// The sweeps run one after the other, and each run is scheduled only after
// the previous one settled, so two never overlap. A failed sweep is logged
// and neither stops the other sweeps of the same run nor the next run. The
// timer is unref'd, so it never keeps the process (or a test run) alive, and
// shutdown cancels it. One API instance runs in production; with several,
// each would sweep, which is harmless.
@Injectable()
export class ReviewFileSweepScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReviewFileSweepScheduler.name);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly photoSweep: SweepOrphanReviewPhotoFilesUseCase,
    private readonly signatureSweep: SweepOrphanReviewSignatureFilesUseCase,
  ) {}

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(REVIEW_FILE_SWEEP_FIRST_DELAY_MS);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.run(), delayMs);
    this.timer.unref();
  }

  private async run(): Promise<void> {
    await this.runSweep('review photo', this.photoSweep);
    await this.runSweep('review signature', this.signatureSweep);
    this.schedule(REVIEW_FILE_SWEEP_INTERVAL_MS);
  }

  // A shutdown during a run starts no further sweep.
  private async runSweep(
    label: string,
    sweep: { execute(): Promise<number> },
  ): Promise<void> {
    if (this.stopped) return;
    try {
      await sweep.execute();
    } catch (error) {
      this.logger.error(
        `Orphan ${label} file sweep failed: ${(error as Error).message}`,
      );
    }
  }
}
