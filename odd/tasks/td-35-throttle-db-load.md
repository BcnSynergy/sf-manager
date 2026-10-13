# TD-35: Login Throttle Database Load

Locator: `odd/tasks/td-35-throttle-db-load.md` (Engram mirror: `odd/td-35-throttle-db-load/tasks`).
Route: ODD (the user confirmed 2026-10-13; `openspec/specs/authentication/spec.md:176-200` does not specify cleanup timing, writes on blocked attempts, or database load).
Branch: `td-35-throttle-db-load/01-cheap-blocked-path` (from main c73997a).

## Objective

Reduce the database load that the persistent login throttle adds under a login flood, without changing any specified throttling behavior.

## Problem

`apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`:

1. Every attempt, including an already-blocked one, runs `INSERT ... ON CONFLICT DO UPDATE`. A blocked attempt changes nothing but still rewrites the tuple (row lock, new tuple version, WAL).
2. Expired-row cleanup runs awaited on the request path when a window opens. It range-scans `ThrottleCounter_windowEndsAt_idx`, but rows whose window ended while still blocked match the index and fail the `blockedUntil` filter, so the `LIMIT 100` may never be reached and the scan walks them all.
3. No `statement_timeout` anywhere; the throttle shares the single Prisma pool with the whole API.

## Why

TD-35 (`docs/technical-debt.md`), raised by the `login-rate-limit-hardening` PR 2 and PR 3 RDD reviews.

## Scope

In:
- Blocked attempts do not rewrite the row (conditional `DO UPDATE ... WHERE`, plus a read of the blocked row's state).
- An `expiresAt` column (greatest of `windowEndsAt` and `blockedUntil`) maintained by the upsert, indexed, replacing the `windowEndsAt` index; cleanup selects on it. Migration with backfill.
- A short `statement_timeout` for the cleanup statement only.
- Docs: README throttle note, TD-35 to Resolved, a note on design Decision 6 if needed.

Out:
- Moving cleanup off the request path (rejected: non-deterministic, contradicts design Decision 6).
- A separate pool, account lockout (TD-31), EN-12 (503 mapping).

## Constraints

- Spec behavior unchanged: every attempt counts, 429 with `Retry-After` while blocked, counters persist across restarts and are shared across instances, concurrent attempts are all counted, fail closed.
- Cleanup stays awaited and deterministic (design Decision 6 of `login-rate-limit-hardening`).
- ADR-006: no scope beyond TD-35.
- Planning heuristic only: about 400 authored changed lines per task.

## TDD

Mode: Strict TDD, on. Source: user global CLAUDE.md ("Strict TDD Mode: enabled"), ADR-016. Runner: Jest. Unit: `npm run test --workspace=apps/api`; integration (real Postgres, hermetic per-run DB): `npm run test:integration --workspace=apps/api`.

## Delivery

Forecast: about 250-350 authored changed lines (code ~80, migration ~15, tests ~150-200, docs ~30). Strategy: `ask-on-risk`; a single PR expected under the budget.

## Tasks

- [x] T1 Blocked attempts do not rewrite the row. Route: delegated direct (writer trigger: adapter + specs). RED: an integration test proving a blocked attempt leaves the row's tuple unchanged (for example `xmin` unchanged) while still returning the blocked state and `timeToBlockExpire`. GREEN: conditional `DO UPDATE ... WHERE`, read fallback when no row is returned. All existing adapter tests stay green.
- [x] T2 `expiresAt` column and index for cleanup. Route: delegated direct. RED: an integration test where many expired-but-still-blocked rows precede deletable rows and cleanup still deletes the deletable ones, scanning only deletable rows (assert via the predicate/index or by row outcome). GREEN: Prisma schema + migration (add column, backfill, index, drop old index), upsert maintains `expiresAt`, cleanup selects `expiresAt < now()`.
- [x] T3 `statement_timeout` for cleanup. Route: delegated direct. RED: a test showing the cleanup runs under a bounded timeout and a timeout failure is logged and does not fail the login. GREEN: cleanup runs in a transaction with `SET LOCAL statement_timeout`.
- [x] T4 Docs and closure. README throttle note, TD-35 to Resolved, design/ADR note if needed; full unit, integration and e2e suites, lint, build. Route: inline (two mechanical doc edits). Done 2026-10-13: README describes the blocked path and the cleanup timeout; TD-35 moved to Resolved (PR number pending). The archived `login-rate-limit-hardening` design is historical and was not edited.

## Acceptance Criteria

- A blocked attempt does not create a new row version.
- Cleanup cost is proportional to rows deleted, not to blocked-but-expired rows.
- Cleanup is bounded by a statement timeout; its failure never fails a login.
- All existing throttle tests (unit, integration, e2e) pass; lint and build pass.

## Progress

- 2026-10-13: exploration done; approach confirmed by the user; document created.
- 2026-10-13: T1 done (route: delegated direct, single writer). Blocked attempts skip the DO UPDATE via `WHERE blockedUntil IS NULL OR blockedUntil <= now()` and a follow-up `readBlocked` SELECT builds the record; a missing row after both statements still fails closed.
- 2026-10-13: T2 done. `expiresAt` + `ThrottleCounter_expiresAt_idx` replace the windowEndsAt index; migration `20261013120000_throttle_counter_expires_at` hand-written (no shadow DB; `prisma validate` and the hermetic integration DB applying all migrations confirm it); upsert maintains `expiresAt` in every branch; cleanup selects `expiresAt < now()`.
- 2026-10-13: T3 done. Cleanup runs in `$transaction` with `set_config('statement_timeout', '500ms', true)` (transaction-local, equivalent to SET LOCAL but bindable, so no raw SQL interpolation) before the delete; constant `CLEANUP_STATEMENT_TIMEOUT_MS = 500`. A real timeout is not forced in an integration test (non-deterministic); failure logging stays covered by the unit spec.
- 2026-10-13: T1 follow-up (parent review). The blocked read moved into the same statement as the upsert (`WITH upsert ... UNION ALL SELECT ... WHERE NOT EXISTS (SELECT 1 FROM upsert)`), removing `readBlocked()` and its race (cleanup deleting the row, or the block ending, between two statements).
- 2026-10-13: native review CRITICAL (NOT NULL `expiresAt` without default broke the previous adapter during a rolling deploy or rollback). Fix: the migration adds a `BEFORE INSERT OR UPDATE` trigger that derives `expiresAt`, the backfill goes through it, and the adapter no longer writes the column. The blocked path does not UPDATE, so the trigger does not fire there.

- 2026-10-13: native review (lineage review-444abe6d2162684c, user granted) required one correction: CRITICAL R4-expiresat-not-null-no-default, fixed in bed1512 with a BEFORE INSERT OR UPDATE trigger owning expiresAt; targeted validation approved and acknowledged. WARNING R2-dead-blocked-branch (dead `blockedUntil > now()` CASE branches) and the WAL comment fixed in the follow-up commit; remaining suggestions registered as EN-20 and EN-21.

## Verification Evidence

T1:
- RED: new integration test (xmin unchanged on a blocked attempt) failed: `Expected: "117714" Received: "117715"` (tuple rewritten).
- GREEN: same suite 13/13 passed; unit spec gained the fallback and fail-closed cases.

T1 follow-up:
- RED: unit test "resolves a blocked attempt from one statement" failed with 2 `$queryRaw` calls instead of 1. The race itself has no deterministic RED (it needs a block ending and a cleanup between two statements); the xmin and blocked-state integration tests stay green as the behavioral guard.
- GREEN: a plain snapshot UNION branch failed the concurrent limit test (stale pre-wait version, isBlocked=false). Final design: `skipped` CTE with `FOR UPDATE` (re-reads the latest locked version) plus one retry when the statement snapshot cannot see a row a concurrent first attempt just inserted (observed as "returned no row"); fail closed after two empty results. Adapter integration 17/17 on 3 consecutive runs.

T2:
- RED: new cleanup tests failed with `column "expiresAt" of relation "ThrottleCounter" does not exist` (42703). The behavior test (150 still-blocked + 30 expired) would also pass on the old predicate; the index assertion is what proves the new access path.
- Index assertion: `EXPLAIN` inside a transaction with `SET LOCAL enable_seqscan = off` (the table is too small for the planner to choose the index on its own), asserting the plan names `ThrottleCounter_expiresAt_idx`. It proves the predicate can use the index, not that the planner prefers it at small sizes.
- GREEN: adapter suite 16/16.

T3:
- RED: new unit tests failed (`Expected number of calls: 1 / Received: 0` for `$transaction`; the cleanup-failure spec also failed against the old top-level `$executeRaw`).
- GREEN: adapter unit spec 6/6; integration adds a no-leak check (`SHOW statement_timeout` is `0` on 5 pooled connections after a cleanup).

## Next Step

RDD review of the branch, fresh-context review, then ask the user before push, PR and merge. Fill the TD-35 PR number once the PR exists.

Final checks after the T1 follow-up (5b938ae): lint 0 errors (4 pre-existing warnings), unit 1430, integration 229 (adapter suite green on 3 consecutive runs), e2e 470 passed (parent re-run), root build green (parent re-run).

Trigger fix: RED = old-style INSERT/ON CONFLICT without expiresAt failed with 23502 (not-null violation); GREEN = see commit checks (lint, unit, integration).
