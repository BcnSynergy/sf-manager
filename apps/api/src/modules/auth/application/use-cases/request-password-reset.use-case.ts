import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
} from '../../../../shared/application/ports/clock.port';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '../../../../shared/application/ports/email-sender.port';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
import {
  OPAQUE_TOKEN_GENERATOR,
  type OpaqueTokenGenerator,
} from '../ports/opaque-token-generator.port';
import {
  PASSWORD_RESET_TOKEN_STORE,
  type PasswordResetTokenStore,
} from '../ports/password-reset-token-store.port';
import {
  buildPasswordResetEmail,
  type PasswordResetEmailLocale,
} from '../services/password-reset-email';
import {
  PASSWORD_RESET_POLICY,
  type PasswordResetPolicy,
} from '../services/password-reset-policy';

export interface RequestPasswordResetInput {
  email: string;
  locale: PasswordResetEmailLocale;
}

const MS_PER_MINUTE = 60_000;
const DRAIN_TIMEOUT_MS = 10_000;

// password-reset S3, S4, S6. The caller always gets the same answer, so the
// work (lookup, token, send) is started and not awaited: its duration cannot
// tell an existing account from an unknown email, and a slow relay never
// holds the request. `whenIdle()` is the seam tests await instead of
// sleeping. Failures are logged without the address and without
// `error.message` (relay and database messages can quote the recipient):
// only the error name and code.
@Injectable()
export class RequestPasswordResetUseCase implements OnModuleDestroy {
  private readonly logger = new Logger(RequestPasswordResetUseCase.name);
  private readonly running = new Set<Promise<void>>();
  // How long shutdown waits for requests already answered 202 (EN-197); a
  // hung relay must not block it forever. Public so tests can shorten it.
  drainTimeoutMs = DRAIN_TIMEOUT_MS;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_TOKEN_STORE)
    private readonly store: PasswordResetTokenStore,
    @Inject(OPAQUE_TOKEN_GENERATOR)
    private readonly tokens: OpaqueTokenGenerator,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(PASSWORD_RESET_POLICY) private readonly policy: PasswordResetPolicy,
  ) {}

  // Starts the work and returns at once; never throws.
  execute(input: RequestPasswordResetInput): void {
    const job: Promise<void> = this.process(input)
      .catch((error: unknown) => {
        this.logger.warn(`Password reset request failed: ${describe(error)}`);
      })
      .finally(() => {
        this.running.delete(job);
      });
    this.running.add(job);
  }

  // Resolves once every started request has finished (successfully or not).
  async whenIdle(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.all([...this.running]);
    }
  }

  // Nest runs this on shutdown (main.ts enables the shutdown hooks): the
  // work already answered with 202 gets `drainTimeoutMs` to finish.
  async onModuleDestroy(): Promise<void> {
    if (this.running.size === 0) {
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.drainTimeoutMs);
    });
    const outcome = await Promise.race([this.whenIdle(), timedOut]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
      this.logger.warn(
        'Password reset requests still running at shutdown were abandoned',
      );
    }
  }

  private async process(input: RequestPasswordResetInput): Promise<void> {
    // The default deletedAt filter (ADR-010) makes a soft-deleted user
    // resolve to null, like an unknown email: no token, no email.
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      return;
    }
    const now = this.clock.now();
    const token = this.tokens.generate();
    await this.store.createReplacingUnused({
      id: this.ids.generate(),
      userId: user.id,
      tokenHash: this.tokens.hash(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.policy.tokenTtlMs),
    });
    // Opportunistic housekeeping: never gates the email.
    try {
      await this.store.deleteExpired(now);
    } catch {
      // swallow: stale rows linger a bit longer, which is harmless.
    }
    const message = buildPasswordResetEmail({
      locale: input.locale,
      link: `${this.policy.webOrigin}/reset-password#token=${token}`,
      lifetimeMinutes: Math.round(this.policy.tokenTtlMs / MS_PER_MINUTE),
    });
    await this.email.send({ to: user.email, ...message });
  }
}

// Name and code only, each as a short plain value: never `error.message`.
function describe(error: unknown): string {
  const name =
    error instanceof Error && /^\w{1,64}$/.test(error.name)
      ? error.name
      : 'Error';
  const code = (error as { code?: unknown } | null)?.code;
  const text =
    typeof code === 'string' || typeof code === 'number'
      ? String(code).slice(0, 64)
      : undefined;
  return text === undefined ? name : `${name} (${text})`;
}
