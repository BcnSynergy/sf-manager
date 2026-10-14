import { ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(LoginThrottlerGuard.name);

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
  // email failure. The read is advisory: the request is denied either way, so
  // a storage error is logged at warn (never with the email) and the response
  // stays the client key's 429. Failing closed here would protect nothing and
  // lose the 429 and its Retry-After. The email check and the failure record
  // in the login use case still fail closed.
  //
  // The override relies on the library having already set the client key's
  // Retry-After header before it calls throwThrottlingException, so the larger
  // value written here replaces it.
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { req, res } = this.getRequestResponse(context);
    // Guards run before the validation pipe, so the body is still raw input.
    const body = req.body as { email?: unknown } | undefined;
    const email = loginEmailSchema.safeParse(body?.email);
    if (email.success) {
      try {
        const block = await this.failureLimiter.getBlock(email.data);
        if (
          block.blocked &&
          block.retryAfterSeconds > detail.timeToBlockExpire
        ) {
          (res as { header(name: string, value: number): void }).header(
            'Retry-After',
            block.retryAfterSeconds,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Email block read failed on a rate-limited login: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    return super.throwThrottlingException(context, detail);
  }
}
