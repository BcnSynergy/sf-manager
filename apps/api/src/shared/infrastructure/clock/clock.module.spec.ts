import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK, type Clock } from '../../application/ports/clock.port';
import { FixedClock } from '../../testing/fixed-clock';
import { ClockModule } from './clock.module';
import { SystemClock } from './system-clock';

@Injectable()
class ClockConsumer {
  constructor(@Inject(CLOCK) readonly clock: Clock) {}
}

// Deliberately does NOT import ClockModule: it only resolves CLOCK when the
// module is global.
@Module({ providers: [ClockConsumer], exports: [ClockConsumer] })
class ConsumerModule {}

describe('ClockModule', () => {
  it('binds the CLOCK token to SystemClock', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule],
    }).compile();

    const clock = moduleRef.get<Clock>(CLOCK, { strict: false });

    expect(clock).toBeInstanceOf(SystemClock);
  });

  it('is global: a module that does not import it can inject CLOCK', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule, ConsumerModule],
    }).compile();

    const consumer = moduleRef.get(ClockConsumer, { strict: false });

    expect(consumer.clock).toBeInstanceOf(SystemClock);
  });

  it('lets a test override CLOCK with a FixedClock', async () => {
    const instant = new Date('2026-10-05T10:00:00Z');
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule, ConsumerModule],
    })
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(instant))
      .compile();

    const consumer = moduleRef.get(ClockConsumer, { strict: false });

    expect(consumer.clock).toBeInstanceOf(FixedClock);
    expect(consumer.clock.now().toISOString()).toBe('2026-10-05T10:00:00.000Z');
  });
});
