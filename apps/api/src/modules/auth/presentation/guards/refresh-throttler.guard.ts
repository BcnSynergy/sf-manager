import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import {
  REFRESH_RATE_LIMIT_CONFIG,
  type RefreshRateLimitConfig,
} from '../../infrastructure/config/refresh-rate-limit.config';
import { toClientKey } from './client-key';

// TD-5 S7: per-client-key limit for POST /auth/refresh, tracked like the
// login limit (toClientKey) but counted on its own: the throttler key
// includes the handler, and the limit and window replace the module-wide
// throttler's (login's) with REFRESH_RATE_LIMIT_CONFIG, read once at boot.
@Injectable()
export class RefreshThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(REFRESH_RATE_LIMIT_CONFIG)
    private readonly limits: RefreshRateLimitConfig,
  ) {
    super(options, storageService, reflector);
  }

  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(toClientKey(req.ip));
  }

  protected override handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    return super.handleRequest({
      ...requestProps,
      limit: this.limits.maxAttempts,
      ttl: this.limits.windowMs,
      blockDuration: this.limits.windowMs,
    });
  }
}
