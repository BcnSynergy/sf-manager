import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

// Postgres-backed ThrottlerStorage (login-rate-limit-hardening/design.md
// Decisions 4-6, TD-30). Wired into AuthModule through
// ThrottlerModule.forRootAsync.
//
// The key is already ThrottlerGuard.generateKey's sha256 hex, so no raw IP is
// ever stored, and `throttlerName` is ignored because it is already part of
// that hash. Every timestamp comparison uses the database clock (now()), so
// all API instances agree on window boundaries regardless of clock drift.
//
// Errors are NOT caught: a storage failure surfaces as a 500 and the login
// attempt is refused (fail closed). Under Prisma 7 + @prisma/adapter-pg a
// raw-query failure surfaces wrapped as P2010 (see the note in
// prisma-review-template.repository.ts); there is nothing useful to map it
// to here, so it propagates as-is.

// @nestjs/throttler 6.4.0 does not re-export ThrottlerStorageRecord from its
// package index, so derive it from the interface instead of deep-importing.
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

// Upper bound on expired rows removed per cleanup, so one login can never pay
// for an unbounded delete (Decision 6).
const CLEANUP_BATCH_SIZE = 100;

// Upper bound on the cleanup statement's runtime. The cleanup is awaited on the
// login path and shares the single Prisma pool with the whole API, so a slow or
// lock-starved delete must give its connection back quickly (TD-35). A
// healthy batch of 100 index-ordered rows takes a few milliseconds; on timeout
// the failure is logged and the login proceeds.
const CLEANUP_STATEMENT_TIMEOUT_MS = 500;

@Injectable()
export class PrismaThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(PrismaThrottlerStorage.name);

  constructor(private readonly prisma: PrismaService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    // ttl and blockDuration are milliseconds, cast to bigint so values above
    // 2^31-1 cannot overflow and fail every login closed (interval * bigint
    // is evaluated as double precision).
    //
    // Window and block ends are anchored on now() truncated to milliseconds:
    // the columns are timestamptz(3), which ROUNDS, so an untruncated
    // now() + ttl could be stored up to 0.5 ms later than ttl and make
    // CEIL(seconds remaining) report one second too many (observed: 61 for a
    // 60 s window). Truncating keeps timeToExpire <= ceil(ttl / 1000).
    //
    // One atomic statement (Decision 5). In ON CONFLICT DO UPDATE every
    // right-hand expression reads the pre-update row `t`, so the three CASE
    // columns see a consistent pre-image:
    //   (A) still blocked          -> no update (DO UPDATE ... WHERE), hit not counted
    //   (B/C) block or window over -> new window, hits = 1
    //   (D) live window            -> hits + 1, block when it exceeds limit
    // "expiresAt" (later of window end and block end, for the indexed cleanup,
    // TD-35) is not written here: a BEFORE trigger derives it on every write.
    // Case (A) is excluded by the DO UPDATE ... WHERE below, so a blocked
    // attempt only takes the row lock (a small lock record in WAL) and writes
    // no new tuple version (no dead tuple, no index churn); the upsert CTE
    // yields no row. The `skipped` CTE then reports
    // the locked row from the same statement, so both branches share one now():
    // the block cannot "end" between the skipped update and the read, and a
    // concurrent cleanup cannot delete the row in between.
    const run = () =>
      this.prisma.$queryRaw<ThrottlerStorageRecord[]>`
      WITH upsert AS (
      INSERT INTO "ThrottleCounter" AS t ("key", "hits", "windowEndsAt", "blockedUntil")
      VALUES (
        ${key}, 1,
        date_trunc('milliseconds', now()) + ${ttl}::bigint * interval '1 millisecond',
        NULL
      )
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE
          WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now() THEN 1
          ELSE t."hits" + 1
        END,
        "windowEndsAt" = CASE
          WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now()
            THEN date_trunc('milliseconds', now()) + ${ttl}::bigint * interval '1 millisecond'
          ELSE t."windowEndsAt"
        END,
        "blockedUntil" = CASE
          WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now() THEN NULL
          WHEN t."hits" + 1 > ${limit}::int
            THEN date_trunc('milliseconds', now()) + ${blockDuration}::bigint * interval '1 millisecond'
          ELSE NULL
        END
      WHERE t."blockedUntil" IS NULL OR t."blockedUntil" <= now()
      RETURNING *
      ),
      -- FOR UPDATE re-reads the latest committed version of the row this very
      -- statement just locked (a plain snapshot read could return the stale
      -- pre-wait version of a concurrent attempt).
      skipped AS (
        SELECT t."hits", t."windowEndsAt", t."blockedUntil"
        FROM "ThrottleCounter" t
        WHERE t."key" = ${key} AND NOT EXISTS (SELECT 1 FROM upsert)
        FOR UPDATE
      ),
      result AS (
        SELECT "hits", "windowEndsAt", "blockedUntil" FROM upsert
        UNION ALL
        SELECT "hits", "windowEndsAt", "blockedUntil" FROM skipped
      )
      SELECT
        "hits" AS "totalHits",
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("windowEndsAt" - now()))))::int AS "timeToExpire",
        ("blockedUntil" IS NOT NULL AND "blockedUntil" > now()) AS "isBlocked",
        CASE WHEN "blockedUntil" > now()
          THEN CEIL(EXTRACT(EPOCH FROM ("blockedUntil" - now())))::int
          ELSE 0
        END AS "timeToBlockExpire"
      FROM result
    `;

    // One empty result is legitimate: this statement's snapshot predates a
    // row a concurrent first attempt inserted, the upsert then skipped because
    // that row became blocked, and the snapshot read cannot see it. A fresh
    // statement sees it, so retry once.
    const row = (await run())[0] ?? (await run())[0];
    if (row === undefined) {
      // Two statements in a row found nothing, which the reasoning above rules
      // out short of a driver contract change or an unexpected delete. Fail
      // closed rather than let the attempt through uncounted.
      throw new Error('ThrottleCounter increment returned no row');
    }

    // A new row or a reset window: the only moments the table can have grown,
    // so the only moments cleanup runs (Decision 6).
    if (row.totalHits === 1) {
      await this.deleteExpired();
    }

    return {
      totalHits: row.totalHits,
      timeToExpire: row.timeToExpire,
      isBlocked: row.isBlocked,
      timeToBlockExpire: row.timeToBlockExpire,
    };
  }

  // Best-effort, bounded cleanup. SKIP LOCKED never waits on a row a
  // concurrent increment holds, and FOR UPDATE re-checks the WHERE clause
  // against the newest row version, so a row a concurrent increment just
  // revived is not deleted. Failures are swallowed: cleanup must never gate
  // an otherwise-successful login (same precedent as the token denylist's
  // deleteExpired() in LoginUseCase/LogoutUseCase).
  private async deleteExpired(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // set_config(..., true) is SET LOCAL with a bindable value: the
        // timeout ends with the transaction, so it can never leak onto the
        // pooled connection and affect other queries.
        await tx.$executeRaw`
          SELECT set_config('statement_timeout', ${`${CLEANUP_STATEMENT_TIMEOUT_MS}ms`}, true)
        `;
        await tx.$executeRaw`
          DELETE FROM "ThrottleCounter" WHERE "key" IN (
            SELECT "key" FROM "ThrottleCounter"
            WHERE "expiresAt" < now()
            LIMIT ${CLEANUP_BATCH_SIZE}::int
            FOR UPDATE SKIP LOCKED
          )
        `;
      });
    } catch (error) {
      // Swallowed (see above) but not silent: a persistently failing cleanup
      // would otherwise let the table grow unnoticed.
      this.logger.warn(
        `ThrottleCounter cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
