import type { Clock } from '../application/ports/clock.port';

// Test double for the `Clock` port: reports a pinned instant until advanced.
// Returns a copy on every read so a caller cannot mutate the held instant.
export class FixedClock implements Clock {
  private instant: Date;

  constructor(instant: Date) {
    this.instant = new Date(instant.getTime());
  }

  now(): Date {
    return new Date(this.instant.getTime());
  }

  advanceTo(instant: Date): void {
    this.instant = new Date(instant.getTime());
  }
}
