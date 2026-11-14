import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { loginEmailSchema } from '@sf-manager/validation';
import {
  PASSWORD_RESET_RATE_LIMIT_CONFIG,
  type PasswordResetRateLimitConfig,
} from '../../infrastructure/config/password-reset-rate-limit.config';

// password-reset S6: per-email limit for POST /auth/password-reset/request.
// Every request naming a valid email counts, whether or not an account
// exists, so the 429 (and its Retry-After) is the same for both. The email
// is normalized with loginEmailSchema, like the lookup, and only reaches the
// storage inside the key, which the storage HMACs (THROTTLE_KEY_SECRET).
// Guards run before the validation pipe, so the body is still raw input; a
// body without a valid email is not counted here (the pipe answers 400).
@Injectable()
export class PasswordResetEmailThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(PASSWORD_RESET_RATE_LIMIT_CONFIG)
    private readonly limits: PasswordResetRateLimitConfig,
  ) {
    super(options, storageService, reflector);
  }

  protected override async shouldSkip(
    context: ExecutionContext,
  ): Promise<boolean> {
    const { req } = this.getRequestResponse(context) as {
      req: Record<string, any>;
    };
    return emailOf(req) === undefined || (await super.shouldSkip(context));
  }

  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(`password-reset-email:${emailOf(req) ?? ''}`);
  }

  protected override handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    return super.handleRequest({
      ...requestProps,
      limit: this.limits.emailMaxRequests,
      ttl: this.limits.emailWindowMs,
      blockDuration: this.limits.emailWindowMs,
    });
  }
}

function emailOf(req: Record<string, any>): string | undefined {
  const body = req.body as { email?: unknown } | undefined;
  const parsed = loginEmailSchema.safeParse(body?.email);
  return parsed.success ? parsed.data : undefined;
}
