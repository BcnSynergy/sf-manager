// Port (application layer, ADR-002/013): code that needs "now" depends on
// this interface instead of calling `new Date()`, so tests can pin the
// instant. See review-schedule design.md Decision 4 — the concrete adapter is
// SystemClock (shared/infrastructure/clock/system-clock.ts).
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');
