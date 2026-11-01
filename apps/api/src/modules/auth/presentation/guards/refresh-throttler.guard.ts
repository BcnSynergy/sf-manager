import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { toClientKey } from './client-key';

// TD-5 S7: per-client-key limit for POST /auth/refresh, tracked like the
// login limit (toClientKey) but counted on its own: the throttler key
// includes the handler, and the limits come from @Throttle on the handler
// (getRefreshRateLimitConfig).
@Injectable()
export class RefreshThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(toClientKey(req.ip));
  }
}
