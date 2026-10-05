import { FixedClock } from './fixed-clock';

describe('FixedClock', () => {
  it('returns the fixed instant on every call', () => {
    const clock = new FixedClock(new Date('2026-10-05T10:00:00Z'));

    expect(clock.now().toISOString()).toBe('2026-10-05T10:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-10-05T10:00:00.000Z');
  });

  it('can be advanced to a later instant', () => {
    const clock = new FixedClock(new Date('2026-10-05T10:00:00Z'));

    clock.advanceTo(new Date('2027-01-02T09:00:00Z'));

    expect(clock.now().toISOString()).toBe('2027-01-02T09:00:00.000Z');
  });

  it('does not let callers mutate the held instant', () => {
    const clock = new FixedClock(new Date('2026-10-05T10:00:00Z'));

    clock.now().setUTCFullYear(1999);

    expect(clock.now().toISOString()).toBe('2026-10-05T10:00:00.000Z');
  });
});
