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
- [ ] T2 `expiresAt` column and index for cleanup. Route: delegated direct. RED: an integration test where many expired-but-still-blocked rows precede deletable rows and cleanup still deletes the deletable ones, scanning only deletable rows (assert via the predicate/index or by row outcome). GREEN: Prisma schema + migration (add column, backfill, index, drop old index), upsert maintains `expiresAt`, cleanup selects `expiresAt < now()`.
- [ ] T3 `statement_timeout` for cleanup. Route: delegated direct. RED: a test showing the cleanup runs under a bounded timeout and a timeout failure is logged and does not fail the login. GREEN: cleanup runs in a transaction with `SET LOCAL statement_timeout`.
- [ ] T4 Docs and closure. README throttle note, TD-35 to Resolved, design/ADR note if needed; full unit, integration and e2e suites, lint, build.

## Acceptance Criteria

- A blocked attempt does not create a new row version.
- Cleanup cost is proportional to rows deleted, not to blocked-but-expired rows.
- Cleanup is bounded by a statement timeout; its failure never fails a login.
- All existing throttle tests (unit, integration, e2e) pass; lint and build pass.

## Progress

- 2026-10-13: exploration done; approach confirmed by the user; document created.
- 2026-10-13: T1 done (route: delegated direct, single writer). Blocked attempts skip the DO UPDATE via `WHERE blockedUntil IS NULL OR blockedUntil <= now()` and a follow-up `readBlocked` SELECT builds the record; a missing row after both statements still fails closed.

## Verification Evidence

T1:
- RED: new integration test (xmin unchanged on a blocked attempt) failed: `Expected: "117714" Received: "117715"` (tuple rewritten).
- GREEN: same suite 13/13 passed; unit spec gained the fallback and fail-closed cases.

## Next Step

T1.
