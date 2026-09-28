# Tasks: Hermetic Integration Tests

## STATUS: ALL PRs COMPLETE. PR 1 merged to main (PR #166, `5edeae6`). PR 2
COMPLETE (6/6 tasks, zero fixture fixes needed, docs-only commit `16c9552`
on `hermetic-integration-tests/02-fk-fixture-fixes`). PR 3 COMPLETE (19/19
tasks) on `hermetic-integration-tests/03-harness-switch`, base = PR 2's
branch/commit. Full evidence in sdd/hermetic-integration-tests/apply-progress.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~580 (code ~210 / test ~370); PR2 TBD after discovery; PR3 ~290 (code ~190 / test ~100) |
| 400-line budget risk | High (PR1 only) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3, stacked-to-main |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

PR1 is ~580 lines total, over budget, but growth is code + its own unit
tests for pure functions (size-exception convention). PR1 **code alone**
is ~210 lines — past the ~200-line code-only mark. **A 1a/1b split is
advisable**: PR 1a = `test-database.ts` pure functions + specs (~120
code / ~230 test); PR 1b = `prepare-test-database.ts` orchestration +
specs (~90 code / ~140 test). Ask the user before apply: proceed with
PR1 as one size-exception PR, or split into 1a/1b.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1(a/b) | Pure harness modules (`test-database.ts`, `prepare-test-database.ts`) + unit specs + tsconfig.build exclusion | PR 1 (or 1a/1b) | Base: main. Includes committing the untracked `openspec/changes/hermetic-integration-tests/` folder |
| 2 | FK-violating fixture fixes, found by local discovery run | PR 2 | Base: PR 1's merge point. Size TBD |
| 3 | Harness switch: globalSetup/Teardown, environment, jest-integration.json, package.json wiring, app rename, docs | PR 3 | Base: PR 2's merge point |

## PR 1: Pure Harness Modules (`src/shared/testing`)

- [x] 1.1 RED: `test-database.spec.ts` — `generateRunDatabaseName`/`isRunDatabaseName` cases (valid, `sfmanager`, bare prefix, lookalikes, byte limit, no collision same ms)
- [x] 1.2 GREEN: implement `generateRunDatabaseName`, `isRunDatabaseName`, `TEST_DATABASE_PREFIX`
- [x] 1.3 RED: `parseRunDatabaseCreatedAt` cases (valid, non-run name, pre-epoch-floor, unparseable)
- [x] 1.4 GREEN: implement `parseRunDatabaseCreatedAt`
- [x] 1.5 RED: `deriveTestDatabaseUrl`/`toMaintenanceUrl`/`assertTestDatabaseUrl` cases (swap db name, missing/garbage/mysql URL, password redaction)
- [x] 1.6 GREEN: implement `deriveTestDatabaseUrl`, `toMaintenanceUrl`, `assertTestDatabaseUrl`
- [x] 1.7 RED: `assertWorkerDatabase` cases (mismatch, both-valid-but-differ, both-agree-on-invalid, missing value)
- [x] 1.8 GREEN: implement `assertWorkerDatabase`
- [x] 1.9 RED: `findDotenvOverride` cases (env var any value incl. `"false"`, argv form, none set)
- [x] 1.10 GREEN: implement `findDotenvOverride`
- [x] 1.11 RED: `isIntegrationSpecPath` cases (both path separators)
- [x] 1.12 GREEN: implement `isIntegrationSpecPath`
- [x] 1.13 RED: `planStaleSweep` cases (23h59m kept, >24h dropped, unparseable/future kept, excludes current run, lookalikes excluded)
- [x] 1.14 GREEN: implement `planStaleSweep`, `STALE_RUN_DATABASE_AGE_MS`
- [x] 1.15 RED: `isObjectInUseError`(55006)/`isDatabaseMissingError`(3D000) cases (recognize + reject other codes)
- [x] 1.16 GREEN: implement both classifiers
- [x] 1.17 RED: `planTeardownDrop` cases (valid → instruction, invalid → null)
- [x] 1.18 GREEN: implement `planTeardownDrop`
- [x] 1.19 RED: `stripUtf8Bom` cases (BOM stripped, BOM-free unchanged)
- [x] 1.20 GREEN: implement `stripUtf8Bom`
- [x] 1.21 REFACTOR: dedupe helpers in `test-database.ts`; confirm exports match design Interfaces/Contracts
- [x] 1.22 RED: `prepare-test-database.spec.ts` — guard-first ordering (no port call on guard failure, incl. malformed-name case), sweep classify (55006/3D000 skip+continue, other rethrow), create/migrate happy path, 42P04 no-drop-rethrow, migrate-fail-drops-own-db-rethrows-original
- [x] 1.23 GREEN: implement `prepareTestDatabase` + `TestDatabasePorts`
- [x] 1.24 REFACTOR: extract shared fakes/test helpers if duplicated
- [x] 1.25 Modify `apps/api/tsconfig.build.json`: exclude `src/shared/testing`
- [x] 1.26 Commit the untracked `openspec/changes/hermetic-integration-tests/` folder in this PR
- [x] 1.27 Verify: `npm test -w apps/api` green; `npm run build -w apps/api` excludes `src/shared/testing` from `dist`

## PR 2: FK Fixture Fixes (discovery-driven) — COMPLETE, no fixes needed

- [x] 2.1 Manually create a scratch Postgres DB (`createdb` or `psql -c "CREATE DATABASE sf_manager_test_scratch"` against the docker-compose Postgres), run `prisma migrate deploy` against it — never against `sfmanager`
- [x] 2.2 Run the full integration suite against the scratch DB using PR 3's harness code from the working tree (or a manual `DATABASE_URL` pointed at the scratch DB), list every failing spec and the FK it violates. Check migrations: `20260825120000_add_community_and_assignments`, `20260827091950_add_maintenance_company`, `20260901094525_add_inspectable_element`, `20260903072531_add_review_template`, `20260907090000_add_review_session`, `20260909090000_add_review_session_performed_by_company` — result: 24/24 suites, 157/157 tests passed on the first run against the fresh scratch DB; zero failures of any kind (no FK violations, no missing-seed failures)
- [x] 2.3 If the failing-spec count is large, STOP and escalate to the user before continuing — N/A, zero failures
- [x] 2.4 Fix each FK-violating fixture so the constraint holds (no skip/disable) — N/A, no violating fixtures found; all 24 integration specs already create their own parent rows and hold up against a truly empty, freshly migrated DB
- [x] 2.5 Verify: re-run the discovery suite against the scratch DB — zero FK violations — satisfied by the single clean discovery run (2.2); no second run performed against the same scratch DB to avoid unique-constraint noise from residual fixture rows, which would test data-pollution, not FK correctness
- [x] 2.6 Drop the scratch DB; commit only fixture corrections (no harness files) — scratch DB dropped; no fixture files changed, so no commit was needed for this PR

## PR 3: Harness Switch + Docs — COMPLETE (19/19 tasks)

- [x] 3.1 RED: create `apps/api/src/shared/infrastructure/persistence/test-database-isolation.integration.spec.ts` asserting `current_database()` matches the run-name pattern, is not `sfmanager`, equals `SF_TEST_RUN_DATABASE` — confirmed RED: fails against the dev DB today (no run DB), via a read-only `SELECT current_database()`
- [x] 3.2 Create `test/test-database/read-base-database-url.ts` (shell env else `dotenv.parse(.env)`, BOM-stripped)
- [x] 3.3 Create `test/test-database/global-setup.ts` (wires `pg`+`spawnSync` into `prepareTestDatabase`; publishes `DATABASE_URL`, `SF_TEST_RUN_DATABASE`, `globalThis.__SF_TEST_RUN_DATABASE__`; migrate's child env carries `DATABASE_URL`, never argv; migrate-failure output is redacted of the URL/password before it can reach a thrown error message)
- [x] 3.4 Create `test/test-database/global-teardown.ts` (reads `globalThis` name, calls `planTeardownDrop`, drops `WITH (FORCE)` or throws)
- [x] 3.5 Create `test/test-database/test-database.environment.ts` (calls `assertWorkerDatabase` in `setup()` and `run_start`, reading sandbox `process.env`)
- [x] 3.6 Create `test/test-database/refuse-integration-spec.setup.ts` (unit tripwire) and wire into unit `setupFilesAfterEnv`
- [x] 3.7 Create `apps/api/test/jest-integration.json` (`roots: src+test`, `globalSetup`, `globalTeardown`, `testEnvironment`)
- [x] 3.8 Modify `apps/api/package.json`: `test:integration` script (`jest --config ./test/jest-integration.json --runInBand`), unit block `setupFilesAfterEnv`, devDeps `pg`, `@types/pg`, `jest-environment-node`
- [x] 3.9 GREEN: run 3.1's isolation spec — passes unmodified, confirmed on first run
- [x] 3.10 Rename `test/app.e2e-spec.ts` → `test/app.integration.spec.ts`; add `current_database()` assertion; fix header comment
- [x] 3.11 Verify: full `test:integration` run — 26/26 suites, 160/160 tests, the 3 concurrency specs pass unmodified
- [x] 3.12 Manual: two concurrent `test:integration` runs each get their own DB, both pass, `psql` confirms neither DB was dropped by the other's sweep (0 leftover `sf_manager_test_*` databases after both finished)
- [x] 3.13 Manual: `DOTENV_CONFIG_OVERRIDE=true npm run test:integration` aborts in `globalSetup`, before any query — confirmed no database was created
- [x] 3.14 Manual: stray `npx jest --testPathIgnorePatterns=/node_modules/ x.integration.spec.ts` (unit config, override removes the integration exclusion) fails every matched integration spec in the tripwire; unit suite itself stays 1042/1042 green
- [x] 3.15 Manual: `npm run test:e2e` passes with Docker/Postgres stopped — 10/10 suites, 440/440 tests, no database needed
- [x] 3.16 Manual: dev-DB row counts (all 15 tables) and the seeded admin (`admin@sfmanager.local`, active) unchanged before/after a full `test:integration` run (`psql`) — exact match
- [x] 3.17 Updated `README.md`: run-name scheme, embedded timestamp, 24h stale-DB retention, run commands (including that concurrent/routine full runs are safe), one-time dev reset (`prisma migrate reset` then `prisma db seed`)
- [x] 3.18 Updated `CLAUDE.md`: rewrote *Dev-DB pollution* bullet (removed "never run the full suite"; states runs are isolated and safe concurrently); updated *Dev data is mostly test fixtures* (QA users gone post-reset until `dev-seed-data`)
- [x] 3.19 **Resolved (user decision):** updated ONLY the comment text in `prisma-user.repository.integration.spec.ts:12-19` and `organization-profile-migration.integration.spec.ts:63-76` to reflect the per-run isolated database; assertions and structural-only strategy unchanged; both comments note live-data checks are now hermetically possible but deferred

### Manual-check evidence appendix

- A3 (scratch check, not part of the numbered list): a scratch spec that set
  `process.env.DATABASE_URL` to the dev URL (read via `readBaseDatabaseUrl`,
  never hardcoded/printed) at import time aborted at `run_start`, with the
  password redacted in the thrown message; 0 tests ran. Deleted immediately
  after, never committed.
- Discovered and fixed during this batch: the tripwire's
  `setupFilesAfterEnv` import of `isIntegrationSpecPath` from
  `test-database.ts` forced that module (and its then-static
  `import { randomBytes } from 'node:crypto'`) to load in every unit test
  file's shared module registry before `test-database.spec.ts`'s own
  `jest.mock('node:crypto', ...)` (hoisted only within that file) could
  register — silently defeating that spec's random-bytes mock. Fixed by
  lazily requiring `node:crypto` inside `generateRunDatabaseName` instead of
  importing it at module top-level, so it only resolves once the mock (if
  any) is already registered; `test-database.ts`'s public contract is
  unchanged. `npm test -w apps/api` returned to 126/126 suites, 1042/1042
  tests green after the fix.
