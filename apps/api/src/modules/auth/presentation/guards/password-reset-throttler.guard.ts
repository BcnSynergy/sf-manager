import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import {
  PASSWORD_RESET_RATE_LIMIT_CONFIG,
  passwordResetRetryAfterSeconds,
  type PasswordResetRateLimitConfig,
} from '../../infrastructure/config/password-reset-rate-limit.config';
import { toClientKey } from './client-key';

// password-reset S6: per-client-key limit for POST /auth/password-reset/request
// and /confirm, tracked like login's (toClientKey) but counted on its own
// (the throttler key includes the handler); the limit and window replace the
// module-wide throttler's (login's) with PASSWORD_RESET_RATE_LIMIT_CONFIG.
@Injectable()
export class PasswordResetThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(PASSWORD_RESET_RATE_LIMIT_CONFIG)
    private readonly limits: PasswordResetRateLimitConfig,
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
      // No X-RateLimit-* counters: they would show which limit applies and,
      // on the per-email guard, how many requests named an email.
      throttler: { ...requestProps.throttler, setHeaders: false },
      limit: this.limits.maxAttempts,
      ttl: this.limits.windowMs,
      blockDuration: this.limits.windowMs,
    });
  }

  // Same Retry-After for both reset limits (passwordResetRetryAfterSeconds).
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    this.setResponseHeader(
      res,
      'Retry-After',
      passwordResetRetryAfterSeconds(this.limits),
    );
    return super.throwThrottlingException(context, detail);
  }
}
