import { Module } from '@nestjs/common';
import {
  createThrottleKeyHasher,
  getThrottleKeySecret,
  THROTTLE_KEY_HASHER,
} from './throttle-key.config';

// EN-181: builds the throttle key hasher once, at boot, so the per-client-key
// counters (ThrottlerModule's storage) and the per-email counters
// (LOGIN_FAILURE_LIMITER) always share one secret. AuthModule imports it, and
// so does ThrottlerModule.forRootAsync, whose factory runs in its own module
// scope; Nest instantiates a module once, so both get the same instance. A
// missing or weak THROTTLE_KEY_SECRET still stops startup (EN-6, EN-180).
@Module({
  providers: [
    {
      provide: THROTTLE_KEY_HASHER,
      useFactory: () => createThrottleKeyHasher(getThrottleKeySecret()),
    },
  ],
  exports: [THROTTLE_KEY_HASHER],
})
export class ThrottleKeyModule {}
