import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type {
  LoginBlock,
  LoginFailureLimiter,
} from '../../application/ports/login-failure-limiter.port';
import type { LoginEmailRateLimitConfig } from '../config/login-rate-limit.config';
import type { ThrottleKeyHasher } from '../config/throttle-key.config';

// Postgres-backed per-email failed-login limiter (login-account-lockout/
// design.md Decisions 3, 4 and 7, TD-31). One "ThrottleCounter" row per
// normalized email, next to the per-client-key rows of PrismaThrottlerStorage:
// same table, same expiresAt trigger, same cleanup (that adapter's bounded
// deleteExpired removes any expired row, whatever its key), so no migration.
//
// The key is HMAC-SHA-256("login-email:" + normalizedEmail) under
// THROTTLE_KEY_SECRET (EN-6, see throttle-key.config.ts): the raw email never
// reaches SQL, a row or a log, and without the secret a reader of the table
// or the logs cannot test candidate emails against it. The per-client-key
// rows (PrismaThrottlerStorage) are HMACs of the library's own sha256 hex
// key, a different preimage, so the two namespaces cannot collide in
// practice.
//
// Every timestamp comparison uses the database clock (now()), so all API
// instances agree on window boundaries regardless of clock drift. Errors are
// NOT caught: a storage failure surfaces to the caller, which fails closed
// (see LoginFailureLimiter).
const EMAIL_KEY_PREFIX = 'login-email:';

@Injectable()
export class PrismaLoginFailureLimiter implements LoginFailureLimiter {
  private readonly logger = new Logger(PrismaLoginFailureLimiter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: LoginEmailRateLimitConfig,
    private readonly hashKey: ThrottleKeyHasher,
  ) {}

  private keyFor(email: string): string {
    return this.hashKey(EMAIL_KEY_PREFIX + email);
  }

  async getBlock(email: string): Promise<LoginBlock> {
    const key = this.keyFor(email);
    // Single primary-key read; writes nothing. A row whose block has ended
    // does not match, so an expired block reads as "not blocked" without
    // waiting for the next failure to clear it.
    const rows = await this.prisma.$queryRaw<{ retryAfterSeconds: number }[]>`
      SELECT CEIL(EXTRACT(EPOCH FROM ("blockedUntil" - now())))::int AS "retryAfterSeconds"
      FROM "ThrottleCounter"
      WHERE "key" = ${key} AND "blockedUntil" > now()
    `;
    const row = rows[0];
    return row === undefined
      ? { blocked: false }
      : { blocked: true, retryAfterSeconds: row.retryAfterSeconds };
  }

  async recordFailure(email: string): Promise<void> {
    const key = this.keyFor(email);
    const { maxFailures, windowMs } = this.config;

    // windowMs is milliseconds, cast to bigint so values above 2^31-1 cannot
    // overflow (interval * bigint is evaluated as double precision).
    //
    // Window and block ends are anchored on now() truncated to milliseconds:
    // the columns are timestamptz(3), which ROUNDS, so an untruncated
    // now() + window could be stored up to 0.5 ms later than the window and
    // make CEIL(seconds remaining) report one second too many (same reason as
    // PrismaThrottlerStorage.increment).
    //
    // One atomic statement. In ON CONFLICT DO UPDATE every right-hand
    // expression reads the pre-update row `t`, so the three CASE columns see
    // a consistent pre-image:
    //   (A) still blocked          -> no update (DO UPDATE ... WHERE): the
    //                                 failure is not counted, the block is
    //                                 not extended and no tuple is written
    //   (B/C) block or window over -> new window, hits = 1
    //   (D) live window            -> hits + 1
    // The block starts on the failure that REACHES maxFailures (>=, unlike
    // the library's >): the 5th failure is evaluated and blocks, the 6th
    // attempt is rejected by getBlock. The fixed window is anchored on the
    // first failure and the block lasts one window.
    // "expiresAt" is not written: a BEFORE trigger derives it on every write.
    //
    // RETURNING yields a row only when this very statement inserted or
    // updated one; "blocked" is true only when it set the block, because a
    // row that was already blocked is skipped and returns nothing. Exactly one
    // concurrent failure therefore observes the transition. An empty result
    // needs no retry (unlike PrismaThrottlerStorage.increment, the caller
    // gets nothing back): it always means another statement blocked the row.
    const rows = await this.prisma.$queryRaw<{ blocked: boolean }[]>`
      INSERT INTO "ThrottleCounter" AS t ("key", "hits", "windowEndsAt", "blockedUntil")
      VALUES (
        ${key}, 1,
        date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond',
        CASE WHEN 1 >= ${maxFailures}::int
          THEN date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond'
        END
      )
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE
          WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now() THEN 1
          ELSE t."hits" + 1
        END,
        "windowEndsAt" = CASE
          WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now()
            THEN date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond'
          ELSE t."windowEndsAt"
        END,
        "blockedUntil" = CASE
          WHEN (t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now()) AND 1 >= ${maxFailures}::int
            THEN date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond'
          WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now() THEN NULL
          WHEN t."hits" + 1 >= ${maxFailures}::int
            THEN date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond'
          ELSE NULL
        END
      WHERE t."blockedUntil" IS NULL OR t."blockedUntil" <= now()
      RETURNING ("blockedUntil" IS NOT NULL) AS "blocked"
    `;

    if (rows[0]?.blocked === true) {
      // The hash is the only identifier logged: the raw email never reaches
      // the logger (design.md Decision 7).
      this.logger.warn(
        `Login email limit reached; bucket ${key} blocked for ${windowMs / 1000}s`,
      );
    }
  }

  async reset(email: string): Promise<void> {
    const key = this.keyFor(email);
    await this.prisma.$executeRaw`
      DELETE FROM "ThrottleCounter" WHERE "key" = ${key}
    `;
  }
}
