import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { loginEmailSchema } from '@sf-manager/validation';
import {
  LOGIN_FAILURE_LIMITER,
  type LoginFailureLimiter,
} from '../../application/ports/login-failure-limiter.port';
import { toClientKey } from './client-key';

// design.md Decision 2: overrides the tracker. The library still hashes the
// key and owns counting, blocking and headers.
//
// login-account-lockout Decision 5: when the client key blocks, the library
// answers with the client key's Retry-After only. If the request also names an
// email that is blocked for longer, telling the client the shorter wait would
// send it back early, so the override raises Retry-After to the larger value.
// The constructor only re-declares the inherited parameters (Nest cannot
// resolve a subclass constructor from the parent's metadata once it adds one)
// plus the limiter.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(LOGIN_FAILURE_LIMITER)
    private readonly failureLimiter: LoginFailureLimiter,
  ) {
    super(options, storageService, reflector);
  }

  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(toClientKey(req.ip));
  }

  // Read-only: the rejected request evaluates no credentials and records no
  // email failure. A storage error propagates (500), the same fail-closed
  // policy as every other email read and write.
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { req, res } = this.getRequestResponse(context);
    // Guards run before the validation pipe, so the body is still raw input.
    const body = req.body as { email?: unknown } | undefined;
    const email = loginEmailSchema.safeParse(body?.email);
    if (email.success) {
      const block = await this.failureLimiter.getBlock(email.data);
      if (block.blocked && block.retryAfterSeconds > detail.timeToBlockExpire) {
        (res as { header(name: string, value: number): void }).header(
          'Retry-After',
          block.retryAfterSeconds,
        );
      }
    }
    return super.throwThrottlingException(context, detail);
  }
}
