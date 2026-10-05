import { Test } from '@nestjs/testing';
import { CLOCK, type Clock } from '../../application/ports/clock.port';
import { ClockModule } from './clock.module';
import { SystemClock } from './system-clock';

describe('ClockModule', () => {
  it('binds the CLOCK token to SystemClock', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule],
    }).compile();

    const clock = moduleRef.get<Clock>(CLOCK, { strict: false });

    expect(clock).toBeInstanceOf(SystemClock);
  });
});
