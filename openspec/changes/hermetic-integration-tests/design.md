# Design: Hermetic Integration Tests

## Technical Approach

The integration run gets its own Jest config; `jest-e2e.json` is untouched.
`globalSetup` generates a unique run database name that embeds its own
creation time (`sf_manager_test_<8-char base36 timestamp>_<6-char random
hex>`), sweeps
stale `sf_manager_test_*` databases left by earlier runs (selected by
embedded age, not by connection state — see Decision 4), creates its own
run database, runs `prisma migrate deploy` against it, and publishes the
run's URL through two channels — `process.env.DATABASE_URL` and
`process.env.SF_TEST_RUN_DATABASE` (the bare run name) — so every test
process, in-band or forked worker, can both receive the URL and verify it
by equality rather than by pattern alone (Decision 3). A custom test
environment (`TestDatabaseEnvironment`, extends `jest-environment-node`)
asserts, in its worker's sandbox, that the inherited `DATABASE_URL` still
names the run database, before any `setupFilesAfterEnv` file or spec
import runs (`jest-integration.json` declares no `setupFiles`, only
`setupFilesAfterEnv`, so there is no earlier hook point to beat), and
checks it again after the spec import and before any hook. `globalTeardown`
drops exactly the database named by the run, read from `globalThis` (set by
`globalSetup` in the same process) rather than re-parsed from the
environment, after verifying it passes `isRunDatabaseName`; this is safe
because the database is exclusively this run's. The unit config gains a
tripwire that refuses integration specs. `PrismaService` and all runtime
code stay unchanged (ADR-013). There is no lock: isolation comes from every
run owning a uniquely named database instead of contending for a shared
one. A crashed run's database may linger for up to 24 hours before the
sweep's age threshold picks it up; this is accepted for local use (see
Decision 4).

The only real-DB spec outside `src/**/*.integration.spec.ts`,
`test/app.e2e-spec.ts`, is renamed to `test/app.integration.spec.ts` and
runs under the integration config; `jest-e2e.json` gets no changes at all,
so `test:e2e` keeps needing no database.

## Evidence (verified in code and `node_modules`)

| # | Fact | Source |
|---|---|---|
| E1 | dotenv 17.4.2 never overwrites a key that is already set unless `override` is true. `dotenv/config` reads `override` from `DOTENV_CONFIG_OVERRIDE` or the argv `dotenv_config_override=`. `Boolean("false")` is `true`, so any value turns it on. | `dotenv/lib/main.js:370-399`, `lib/env-options.js:20-22`, `config.js:2-8` |
| E2 | Each Jest 30 test environment gets its own copy of the worker's `process.env` at the time the environment is instantiated. | `jest-util/build/index.js:170-219` |
| E3 | Order per file: env `setup()` → `setupFilesAfterEnv` → spec import → `run_start` event → `beforeAll` hooks. | `jest-circus/build/runner.js:80-96`, `jestAdapterInit.js:762-765` |
| E4 | If a `beforeAll` fails, the other `beforeAll` hooks still run. Only the test functions are skipped. A throw from an environment's `handleTestEvent` rejects the run before any hook. | `jestAdapterInit.js:803-808`, `:1007`, `:1150-1153` |
| E5 | `PrismaService` reads `DATABASE_URL` when its module loads. | `prisma.service.ts:13` |
| E6 | `dotenv/config` is imported by 20 integration specs, `test/app.e2e-spec.ts:1`, `prisma.config.ts:1`, `prisma/seed.ts:1` and `src/main.ts:1`. `auth.config.ts` does **not** import it (it only mentions it in a comment, lines 38-39). The 4 `*-parity` specs import neither dotenv nor the DB. | grep |
| E7 | The unit config already ignores `*.integration.spec.ts`. `test:integration` reuses that config through CLI overrides. | `apps/api/package.json:80-84`, `:23` |
| E8 | A migration inserts the `OrganizationProfile` singleton row, and a spec asserts that exactly that one row exists. | `20260922100000_add_organization_profile/migration.sql:62`, `organization-profile-migration.integration.spec.ts:111-118` |
| E9 | The dev volume is missing the hand-written FKs. | `organization-profile-migration.integration.spec.ts:178-190` |
| E10 | `process.env` mutations made by `globalSetup` reach every test process, in-band and forked, because Jest's real test-scheduling worker pool is created **after** `globalSetup` finishes, not before. `@jest/core` runs `globalSetup` (`jest/globalSetup:start`/`:end` marks), then only afterwards calls `createTestScheduler` for the real run; the scheduler's worker pool forks child processes with `env: { ...process.env, ... }` captured at fork time, which is after `globalSetup` already mutated `process.env` in the parent. `--runInBand` runs tests in the same parent process, so the mutation is visible directly, with no fork involved. | `@jest/core/build/index.js:3501-3521` (`globalSetup` runs, then the real scheduler and its worker pool are created), `jest-worker/build/index.js:757-771` (`ChildProcessWorker.initialize()`: `env: {...process.env, JEST_WORKER_ID, ...forceColor}`, then `child_process.fork`) |
| E11 | `jest-e2e.json`'s `testRegex` is `.e2e-spec.ts$`; renaming `app.e2e-spec.ts` to `app.integration.spec.ts` makes that config stop matching it, with no edit to `jest-e2e.json` needed. `jest-e2e.json`'s `moduleFileExtensions`, `transformIgnorePatterns`, `moduleNameMapper` and `transform` (including the ts-jest `tsconfig` override) are already identical to the unit block's, confirming `jest-integration.json` needs the same four fields copied, nothing extra for the supertest/`AppModule` bootstrap. | `apps/api/test/jest-e2e.json:5-23`, `apps/api/package.json:73-109` |

Because of E10, mechanism 1 below relies on `globalSetup`'s `process.env`
mutation reaching every worker; the custom environment is still needed as a
defense-in-depth assertion layer (Decision 3), not to carry the value.

## Architecture Decisions

| # | Question | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | How does the run's database URL reach every worker? | `globalSetup` computes the run URL once (base URL with the database name replaced by the generated `sf_manager_test_<timestamp>_<random>`) and writes it, plus the bare run name, to `process.env.DATABASE_URL` and `process.env.SF_TEST_RUN_DATABASE` in the parent process before the real test scheduler is created. `TestDatabaseEnvironment.setup()` reads both inherited values from its sandbox `this.global.process.env` (the test global's own copy, already populated per E2/E10 — not the Node `process.env` of the environment instance itself) and asserts the database name derived from `DATABASE_URL` equals `SF_TEST_RUN_DATABASE`, not merely that it matches the run pattern; it does not derive or write either value itself. `handleTestEvent('run_start')` re-checks the same way, reading `this.global.process.env` again (not the outer `process.env`), after the spec import — this matters because a spec's own `dotenv/config` import mutates the sandbox's `process.env`, not the environment instance's outer one, so re-checking the wrong object would silently miss a spec-time override. | Deriving the run database name independently in each worker: no longer possible, since the run id is generated once per run and is not a deterministic function of the base URL. A `TEST_DATABASE_URL`-only scheme with no re-assertion in the environment: loses the defense-in-depth layer that catches a worker whose own `dotenv/config` import resolved the dev URL. Pattern-match only, with no `SF_TEST_RUN_DATABASE` equality check: lets a worker that resolved a sibling run's differently-named but still pattern-valid database pass unnoticed. | E10 (fork happens after `globalSetup`, so the mutation is visible in every worker), E2, E3. The spec's `dotenv/config` import cannot overwrite the key (E1), so `PrismaService` gets the run URL (E5). |
| 2 | Where does the run's base URL come from, and how is the run name generated? | Take the shell `DATABASE_URL`, or else `apps/api/.env` through `dotenv.parse` (never written to `process.env`). The run name is `sf_manager_test_<timestamp>_<random>`: `timestamp` is the 8-character, zero-padded base36 encoding of `Date.now()` (lowercase `[0-9a-z]{8}`, monotonically increasing per millisecond) and `random` is 3 random bytes rendered as 6 lowercase hex characters (`[0-9a-f]{6}`), joined by a single `_`, matching the exact-shape anchored pattern `^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$` — the same pattern `isRunDatabaseName` uses (Decision 4) — and well within Postgres's 63-byte identifier limit (16-byte prefix + 8-byte timestamp + 1-byte separator + 6-byte hex suffix = 31 bytes). Embedding the creation time in the name (rather than only in a side-channel) lets the stale sweep parse a run's age directly from its database name (Decision 4), with no extra bookkeeping table. Replace the base URL's database path with the run name; credentials, host and `?schema=public` stay (`README.md:18`). | A `TEST_DATABASE_URL`: a second source of truth that is not needed yet. Defer it until CI exists. A UUID for `id`: needlessly long against the 63-byte limit once combined with the `sf_manager_test_` prefix (16 bytes), and does not embed an age the sweep can parse. | No new secret. The trade-off: the run database always lives on the dev server, which is right for the local docker-compose setup. |
| 3 | Guard design and order | Two independent checks, both driven from `prepareTestDatabase`'s injected `env` (Decision 13): `assertTestDatabaseUrl` — the generated database name must match the exact-shape anchored pattern `^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$` (so neither `sfmanager`, the bare `sf_manager_test`, nor a lookalike name matches) — and `findDotenvOverride(env, argv)`, a separate pure function that detects a dotenv override trigger (E1); `prepareTestDatabase` calls both before issuing any port call. It runs (a) first in `globalSetup` (via `prepareTestDatabase`), before any connection, (b) in the environment's `setup()` (via the pure `assertWorkerDatabase`, Decision 13), and (c) in `handleTestEvent('run_start')`, after the spec import and before any hook, as a hard stop (E4). Layers (b) and (c) call `assertWorkerDatabase(env)` exactly as its own contract states: it derives the database name from `DATABASE_URL` and checks that name for **equality against the published run name** `SF_TEST_RUN_DATABASE`, not pattern-match alone — the same wording used at Decision 13 and in the Interfaces section, so the two do not contradict. `globalSetup` publishes the run name through a second channel, `process.env.SF_TEST_RUN_DATABASE`, alongside `process.env.DATABASE_URL`; a worker whose effective `DATABASE_URL` derives a database name that differs from `SF_TEST_RUN_DATABASE` aborts, even if that name still happens to match the run-name pattern. Pattern-matching alone would let a worker that resolved a *different* run's valid `sf_manager_test_*` URL pass silently. The unit config gets a `setupFilesAfterEnv` tripwire: it throws when `expect.getState().testPath` is an integration spec, before the spec import (E3). | A guard in `PrismaService` (ADR-013, and the proposal rules it out). A root `beforeAll`: not a hard stop, because spec hooks would still connect and seed (E4). A looser `_test` suffix rule: would also match the bare `sf_manager_test`, which no run should ever target again. Pattern-match only, with no second channel: passes a worker that resolved a sibling run's differently-named but still-valid database, which the equality check catches. Leaving the dotenv-override check only inside untested `global-setup.ts` glue: gives it no unit-testable home; adding `env` to `TestDatabasePorts` fixes that. | Defense in depth. Layer (c) catches the unexpected. The tripwire covers a stray `npx jest --testPathIgnorePatterns=/node_modules/ x.integration.spec.ts`. |
| 4 | How is each run's database created, and how are stale ones cleaned up? | `globalSetup`, before creating its own database: lists **all** database names on the maintenance DB (`postgres`) via `SELECT datname FROM pg_database WHERE NOT datistemplate` — never a SQL `LIKE 'sf_manager_test_%'` filter, because `_` is itself a SQL wildcard and would also match lookalike names such as `sfXmanagerXtestX...`. `listDatabases` returns the raw name list; filtering to run databases happens only in JS, through `isRunDatabaseName` (the anchored regex is the sole authority on what counts as a run database). `planStaleSweep(names, runName, now())` then selects, from the names that pass `isRunDatabaseName` (excluding its own generated name), only those whose embedded creation timestamp — read by the pure `parseRunDatabaseCreatedAt(name)` — is older than `STALE_RUN_DATABASE_AGE_MS` (24 hours). A name with a missing or unparseable embedded timestamp is never selected, so an unrecognized or corrupted name is left alone rather than guessed at. `globalSetup` attempts `DROP DATABASE "<name>"` (no `FORCE`) on each selected name; a drop that fails with SQLSTATE 55006 (object in use) is a **secondary safety check** — it means a live run still owns that database even though its age crossed the threshold (for example a very long-running suite) — the sweep skips it and continues. A drop that fails with SQLSTATE 3D000 (`invalid_catalog_name`, database does not exist) means another concurrent run's sweep already dropped that same stale database first; the sweep also skips it and continues, since there is nothing left to drop. Any other error is rethrown. Then `globalSetup` runs `CREATE DATABASE "<run-name>"` on the maintenance DB. DROP and CREATE are always separate `client.query` calls, never concatenated into one multi-statement string, because Postgres rejects `CREATE DATABASE`/`DROP DATABASE` inside the implicit transaction block a multi-statement string opens. Dropping the run's own database is permitted **only after `CREATE` has succeeded**. If `CREATE` itself fails — including with SQLSTATE 42P04 (`duplicate_database`), which means a database with that generated name already exists and therefore belongs to some other run, never to this one — `globalSetup` rethrows immediately with no DROP attempt; dropping in that case would risk dropping a database this run never owned. If `CREATE` succeeds but the subsequent `migrate` fails, `globalSetup` drops its own run database (`WITH (FORCE)`, safe now that only this run could ever have connected to it) in a `try`/`catch` before rethrowing, so a failed migrate doesn't leak a database into the next sweep. Every DROP/CREATE identifier passed to Postgres is double-quoted and comes only from a name that already passed `isRunDatabaseName`. Age-based selection, not connection-state, is what makes the sweep safe against a live run: SQLSTATE 55006 only fires when a connection happens to be open at the instant of the DROP, and a live run has zero-connection windows (between `CREATE` and `migrate`, between spec files, during connectionless parity specs) during which a connection-only sweep could drop a database still in active use. Teardown is a separate decision (row 12). | Recreate-in-place of a single fixed name (the previous design): serializing concurrent runs against one name needs a lock; replaced entirely by per-run isolation. `TRUNCATE` of every table except `_prisma_migrations`: it deletes the migration-seeded row and breaks the spec (E8). A single multi-statement SQL string for DROP+CREATE: rejected — Postgres errors on `CREATE`/`DROP DATABASE` inside a transaction block, which a multi-statement string implicitly opens. Selecting sweep candidates by SQLSTATE 55006 alone (the original design): unsafe — a live run's zero-connection windows mean 55006 does not fire reliably, so a stale sweep could drop a database a live run still owns. Rethrowing on SQLSTATE 3D000: rejected — two concurrent runs' sweeps can both select the same stale database, and the second one to attempt the DROP would otherwise abort its own run over a database that is already gone, not a real failure. A SQL `LIKE 'sf_manager_test_%'` filter in `listDatabases`: `_` is a wildcard, so it would also match unrelated lookalike names; rejected in favor of listing everything and filtering with the anchored regex in JS. | Every run starts in exact migrated state, in its own database. The only destructive statements can never name the dev database (the guard only ever validates `sf_manager_test_*` names) or a live run's database within the retention window (age-based selection). Cost: a `CREATE DATABASE` + `migrate deploy` per run, a few seconds, plus up to 24h of a crashed run's database lingering — both accepted for local use. **This deviates from proposal item 2** (see proposal Amendments). |
| 5 | Which DB client does `globalSetup` use? | `pg` `Client`, declared as a devDependency (8.23 is already installed through `@prisma/adapter-pg`). | `PrismaService`: it fixes its URL at import (E5). `psql` through `docker compose`: couples the harness to the container. | Explicit connection strings, and no env captured at import time. |
| 6 | How do migrations run? | `spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: apps/api, env: { ...process.env, DATABASE_URL: runUrl } })`. A non-zero exit throws. | Running `npx prisma` through a shell: the Windows `.cmd` shim needs `shell: true`. | `prisma.config.ts:1` loads dotenv without override (E1), and `env('DATABASE_URL')` (`:18`) then reads the explicit value. |
| 7 | How are unit and integration separated, and where do integration specs live? | New `test/jest-integration.json` (`rootDir: ".."`, `roots: ["<rootDir>/src", "<rootDir>/test"]`, integration regex, `globalSetup`, `globalTeardown`, `testEnvironment`). Adding `<rootDir>/test` to `roots` is what lets the renamed `test/app.integration.spec.ts` (Decision 8) be picked up alongside `src/**/*.integration.spec.ts`, with no extra config (E11). Script: `jest --config ./test/jest-integration.json --runInBand`. The unit block only gains the tripwire. | Keeping CLI overrides on the shared block (E7). A separate config just for `test/app.integration.spec.ts`: needless duplication once `roots` covers both directories. | The unit run never loads `globalSetup`. |
| 8 | How does `app.e2e-spec.ts` get covered by the guard without coupling `test:e2e` to the database? | Rename `test/app.e2e-spec.ts` to `test/app.integration.spec.ts` and let it run under the integration config (Decision 7). `jest-e2e.json`'s `testRegex` (`.e2e-spec.ts$`) then stops matching it with no edit (E11); `jest-e2e.json` gets **no** `globalSetup`/`globalTeardown`/`testEnvironment` changes at all, so `test:e2e`'s other 10 specs (all of which stub `PrismaService`) keep needing no Docker. | Giving `jest-e2e.json` the same `globalSetup`/`testEnvironment` as integration (the previous design): couples all 11 e2e specs to a running database container just to cover the one spec that needs it. A separate, `jest-e2e.json`-like config just for this one file: no benefit over reusing the integration config once `roots` already covers `test/`. | Satisfies the original guard requirement (the spec that talks to a real database is covered) without regressing `test:e2e`'s no-Docker property, which the proposal never asked to change. **This deviates from proposal item 3** (see proposal Amendments). |
| 9 | Dev-DB reset | Documented, one-time, no npm script: `npm exec -w apps/api -- prisma migrate reset` (no `--force`, so Prisma's prompt names the database), then `prisma db seed` explicitly. The seed is idempotent (`seed.ts:63-66`), so it is safe whether or not the reset seeds on its own. | Truncate then seed: keeps the FK drift (E9). A standing destructive script. | This also restores the missing FKs. The harness never calls `migrate reset`, and the reset reads the dev URL. |
| 10 | How do concurrent runs avoid colliding? | Isolation instead of serialization: each run generates and owns a uniquely named database (Decision 2, Decision 4), so there is nothing to lock. The shared-state risk is the stale sweep dropping a database another live run still owns; it is handled primarily by age-based selection (Decision 4 — a live run's database is younger than `STALE_RUN_DATABASE_AGE_MS` and is therefore never selected, regardless of its connection state), with the SQLSTATE 55006 skip as a secondary safety check for the rare case a database's age crosses the threshold while still genuinely in use, and the SQLSTATE 3D000 skip covering the case where two concurrent sweeps both select the same stale database and the second drop attempt finds it already gone. No lock client, no unlock-on-teardown path. `globalThis` is used only to hand the run name from `globalSetup` to `globalTeardown` within the same parent process (Decision 12), not for cross-run coordination. | An advisory lock (`pg_try_advisory_lock`) serializing a shared fixed database name: correct but adds a failure mode (a crashed process must release the lock via session end) that per-run isolation makes unnecessary entirely. A retry/wait loop: hides two runs racing for the same database and adds flaky timing — moot once names never collide. Connection-state-only sweep selection (SQLSTATE 55006 as the sole check): unsafe on its own, since a live run has zero-connection windows during which 55006 never fires (see Decision 4). | Nothing to serialize means nothing to get wrong. Isolation is a stronger property than mutual exclusion: two runs can now make progress at the same time instead of one waiting on the other. |
| 11 | How are FK-violating fixtures handled, and when? | Apply begins with a **local discovery run**, before PR 2 is written: the new harness (built locally in PR 3's working tree, or against a throwaway migrated database) runs the full integration suite against a freshly created and migrated database with FKs enforced, listing every failing spec and the FK it violates. Candidate migrations with hand-written FKs to check first (verified present under `apps/api/prisma/migrations`): `20260825120000_add_community_and_assignments`, `20260827091950_add_maintenance_company`, `20260901094525_add_inspectable_element`, `20260903072531_add_review_template`, `20260907090000_add_review_session`, `20260909090000_add_review_session_performed_by_company`. Each failing fixture is corrected so the FK holds; none is skipped or disabled. The fixes land in **PR 2**, ahead of the harness-switch PR (PR 3), so they are harmless on the dev database (which lacks those FKs) and reviewable independently of the harness wiring. | Skipping or disabling the failing specs: leaves the FK drift (E9) undetected instead of fixed. Fixing fixtures inline in the harness-switch PR: couples an unknown-sized fixture cleanup to that PR's budget. Fixing fixtures after the harness switch merges: leaves `main` red (or the suite still effectively unusable) between the two PRs. | Keeps the harness-switch PR (PR 3) reviewable at a known size; isolates fixture risk in its own PR, escalated to the user if the discovered count is large; and orders the chain so `main` is never left in a broken state (see Migration/Rollout). |
| 12 | What does teardown drop, and how does it decide? | The teardown decision is a pure, unit-tested function under `src/shared/testing`, `planTeardownDrop(runName)`, that verifies `runName` passes `isRunDatabaseName` and returns the single drop instruction for exactly that name, or `null` if it does not. `global-teardown.ts` (thin glue) reads the run name from `globalThis` — set by `global-setup.ts` in the same parent process right after `prepareTestDatabase` resolves, not re-parsed from `process.env.SF_TEST_RUN_DATABASE` or the URL — and calls the pure function before issuing `DROP DATABASE "<name>" WITH (FORCE)`. If `planTeardownDrop` returns `null`, `global-teardown.ts` throws a clear error naming the invalid value and issues no DROP. | Re-deriving the name from `process.env` at teardown time: works today but duplicates the parsing surface and is untested; a `globalThis` handoff from the same `globalSetup` call that already computed the name is simpler and needs no re-derivation. No guard at all before the drop (the original design): a `WITH (FORCE)` drop with no verification has no test coverage and no requirement, so a bug that fed it the wrong name would silently drop an unintended database. | Closes the gap the judge flagged: teardown's `DROP ... WITH (FORCE)` previously had no requirement, no guard and no unit test. Moving the decision into a pure function makes it testable the same way the sweep and guard already are. |
| 13 | Where does the worker-side guard decision live, and is it unit-tested? | The `setup()`/`run_start` abort logic is a pure function under `src/shared/testing`, `assertWorkerDatabase(env)`, that takes the worker's env snapshot and throws with a clear message when `DATABASE_URL`'s derived name does not equal `SF_TEST_RUN_DATABASE`, when that derived name does not itself pass `isRunDatabaseName` (so two channels agreeing on a non-run name, such as both holding `sfmanager`, still aborts), or when either value is missing. `test/test-database/test-database.environment.ts` stays thin, untested glue: it calls `assertWorkerDatabase` from `setup()` and again from `handleTestEvent('run_start')`, but contains no guard logic of its own to unit-test. | Testing the guard only through `jest-environment-node` fakes inside `test/`: possible, but leaves the core equality/abort decision without a home consistent with the rest of the harness's pure-function-plus-thin-glue split (Decision 3, Decision 4, Decision 12), and the File Changes / Testing Strategy tables would otherwise wrongly imply unit coverage for a file under `test/`. | Consistency: every decision that can be pure is pure and unit-tested (`npm test`); every file under `test/` is thin, untested glue proved by the isolation spec and manual checks instead. |

## Data Flow

    npm run test:integration
      globalSetup (parent process)
        base = shell DATABASE_URL ?? parse(apps/api/.env)          ── strips a leading UTF-8 BOM first
        findDotenvOverride(env, argv)                              ── non-null → throw, abort before any port call
        runName = generateRunDatabaseName(ports.now())             ── e.g. sf_manager_test_mug72800_9fbc21 (mug72800 = Date.UTC(2026,8,25).toString(36), 2026-09-25); embeds ports.now(), the same value fed to planStaleSweep below
        runUrl = deriveTestDatabaseUrl(base, runName) → assertTestDatabaseUrl  ── fail → abort, no query
        pg(maintenanceUrl): listDatabases()                        ── all pg_database.datname, WHERE NOT datistemplate; no SQL LIKE filter
        names = listDatabases().filter(isRunDatabaseName)          ── anchored regex is the sole authority, never SQL LIKE
        stale = planStaleSweep(names, runName, now())               ── selects only names with parseRunDatabaseCreatedAt(name) older than STALE_RUN_DATABASE_AGE_MS (24h); unparseable/missing timestamp → never selected; excludes runName itself
        pg(maintenanceUrl): DROP each name in stale, one at a time
          ── 55006 (in use) → secondary safety check, skip that one, continue
          ── 3D000 (already gone, dropped concurrently by another run's sweep) → skip that one, continue
          ── any other error → rethrow, abort
        pg(maintenanceUrl): CREATE DATABASE "<runName>"            ── separate query from DROP
          ── failure (e.g. 42P04 duplicate_database) → rethrow immediately, no DROP (name may belong to another run)
        spawn prisma migrate deploy  (env DATABASE_URL = runUrl)
          ── failure (CREATE already succeeded) → drop own runName (FORCE) in try/catch, then rethrow
        process.env.DATABASE_URL = runUrl                          ── published (E10)
        process.env.SF_TEST_RUN_DATABASE = runName                 ── second channel, published (E10)
        globalThis.__SF_TEST_RUN_DATABASE__ = runName               ── same-process handoff to globalTeardown
      per test file (each worker, in-band or forked — E10)
        TestDatabaseEnvironment.setup(): assertWorkerDatabase(env)  ── DATABASE_URL's derived name must equal SF_TEST_RUN_DATABASE
        spec import: dotenv/config (no override) → PrismaService adapter(runUrl)
        run_start: assertWorkerDatabase(env) again ── fail → suite fails before any hook
        hooks and tests → sf_manager_test_<timestamp>_<random>
      globalTeardown (parent process)
        runName = globalThis.__SF_TEST_RUN_DATABASE__               ── not re-parsed from env
        planTeardownDrop(runName)                                   ── verifies isRunDatabaseName, else abort with no DROP
        pg(maintenanceUrl): DROP DATABASE "<runName>" WITH (FORCE)  ── safe, exclusively this run's

Watch mode: `@jest/core` re-runs `globalSetup`/`globalTeardown` on every
watch cycle. With a per-run database that costs one `CREATE DATABASE` +
`migrate deploy` per cycle instead of a single shared recreate, but stays
correct — there is no lock to leak, so a watch cycle can never deadlock the
next one.

## File Changes

| File | Action |
|---|---|
| `apps/api/src/shared/testing/test-database.ts` | Create: pure run-name generation (embeds creation time), URL derivation, worker guard (`assertWorkerDatabase`), dotenv-override detection, integration-spec-path predicate, age-based stale-sweep decision (`planStaleSweep`, `parseRunDatabaseCreatedAt`, `STALE_RUN_DATABASE_AGE_MS`), teardown decision (`planTeardownDrop`) and the 55006/3D000 classifiers (`isObjectInUseError`, `isDatabaseMissingError`; follows the `src/shared/seeding` precedent, so `npm test` covers them) |
| `apps/api/src/shared/testing/test-database.spec.ts` | Create |
| `apps/api/src/shared/testing/prepare-test-database.ts` | Create: orchestration (list → sweep by age → create → migrate → publish) with injected ports |
| `apps/api/src/shared/testing/prepare-test-database.spec.ts` | Create |
| `apps/api/tsconfig.build.json` | Modify: exclude `src/shared/testing` from the build, alongside the existing `**/*spec.ts` exclusion — test-only code must not ship in `dist` |
| `apps/api/test/test-database/read-base-database-url.ts` | Create: shell env, else `dotenv.parse` of `.env` (strips a leading UTF-8 BOM first). Thin glue, untested. |
| `apps/api/test/test-database/global-setup.ts` | Create: wires `pg` and `spawnSync` into `prepareTestDatabase`; publishes `DATABASE_URL` and `SF_TEST_RUN_DATABASE`; sets `globalThis.__SF_TEST_RUN_DATABASE__` for teardown. Thin glue, untested. |
| `apps/api/test/test-database/global-teardown.ts` | Create: reads the run name from `globalThis`, calls `planTeardownDrop`, drops the run database `WITH (FORCE)`. Thin glue, untested — the decision it calls is unit-tested (see `test-database.spec.ts`). |
| `apps/api/test/test-database/test-database.environment.ts` | Create: calls `assertWorkerDatabase` from `setup()` and `handleTestEvent('run_start')`, both reading `this.global.process.env` (the sandbox copy), never the outer `process.env`. Thin glue, untested — the decision it calls is unit-tested (see `test-database.spec.ts`). |
| `apps/api/test/test-database/refuse-integration-spec.setup.ts` | Create: unit tripwire. Thin glue, untested. |
| `apps/api/test/jest-integration.json` | Create: `roots` covering `src` and `test`, `globalSetup`, `globalTeardown`, `testEnvironment` |
| `apps/api/package.json` | Modify: `test:integration` script, `setupFilesAfterEnv` in the unit block, devDependencies `pg`, `@types/pg`, `jest-environment-node` |
| `apps/api/src/shared/infrastructure/persistence/test-database-isolation.integration.spec.ts` | Create: asserts `current_database()` matches the run-name pattern and is not `sfmanager` |
| `apps/api/test/app.e2e-spec.ts` → `apps/api/test/app.integration.spec.ts` | Rename, plus a `current_database()` assertion matching the run-name pattern; update the header comment (currently says it runs only via `npm run test:e2e`) to reflect it now runs under `test:integration` |
| `README.md` | Modify: test DB naming (including the embedded-timestamp id and the 24h stale-database retention note), run commands, one-time dev reset. No concurrency constraint to document — concurrent runs are isolated, not serialized |
| `CLAUDE.md` | Modify: rewrite the *Dev-DB pollution* bullet (remove the "never run the full suite" warning, state real-DB runs are isolated and safe to run concurrently). Update *Dev data is mostly test fixtures*: after the reset, QA users are gone until `dev-seed-data` lands |

`jest-e2e.json` is unmodified (Decision 8).

## Interfaces / Contracts

```ts
// src/shared/testing/test-database.ts
export const TEST_DATABASE_PREFIX = 'sf_manager_test_';
export const STALE_RUN_DATABASE_AGE_MS = 24 * 60 * 60 * 1000;               // 24h retention threshold, named constant
export function generateRunDatabaseName(now?: number): string;              // sf_manager_test_<8-char base36 timestamp>_<6-char random hex>, 31 bytes total, within 63 bytes
export function isRunDatabaseName(name: string): boolean;                   // ^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$, anchored, exact shape
export function parseRunDatabaseCreatedAt(name: string): number | null;     // reads the embedded timestamp; null if unparseable, not a run name, or before the plausible-epoch floor (2026-01-01T00:00:00Z)
export function deriveTestDatabaseUrl(baseUrl: string | undefined, runName: string): string; // throws: missing, unparsable, not postgres(ql):
export function toMaintenanceUrl(url: string): string;                      // swaps the database path to /postgres, keeps the query string unchanged
export function assertTestDatabaseUrl(url: string | undefined): void;       // message redacts the password
export function assertWorkerDatabase(env: NodeJS.ProcessEnv): void;         // throws unless DATABASE_URL's derived name === SF_TEST_RUN_DATABASE AND isRunDatabaseName(that name); message redacts the password
export function findDotenvOverride(env: NodeJS.ProcessEnv, argv: readonly string[]): string | null;
export function isIntegrationSpecPath(testPath: string): boolean;           // \ and / separators
export function planStaleSweep(existingNames: readonly string[], currentRunName: string, now?: number): readonly string[];
  // selects only names where isRunDatabaseName(name) && name !== currentRunName && (now - parseRunDatabaseCreatedAt(name)) > STALE_RUN_DATABASE_AGE_MS;
  // a name with a null (unparseable/missing) timestamp is never selected; lookalike, uppercase, quoted, hyphenated or unrelated names are excluded by isRunDatabaseName before the age check ever runs
export function isObjectInUseError(error: unknown): boolean;                // SQLSTATE 55006, secondary safety check only
export function isDatabaseMissingError(error: unknown): boolean;            // SQLSTATE 3D000, database already gone (dropped concurrently by another run's sweep)
export function planTeardownDrop(runName: string): { name: string } | null; // null (no drop) unless isRunDatabaseName(runName); null means the glue throws and issues no DROP
export function stripUtf8Bom(text: string): string;                        // strips a leading BOM before dotenv.parse

// src/shared/testing/prepare-test-database.ts
export interface TestDatabasePorts {
  baseUrl: string | undefined; argv: readonly string[]; env: Readonly<NodeJS.ProcessEnv>; now?: () => number;
  listDatabases(maintenanceUrl: string): Promise<string[]>;                // all pg_database.datname WHERE NOT datistemplate; never a SQL LIKE filter — filtering to run databases happens in JS via isRunDatabaseName
  dropDatabase(maintenanceUrl: string, name: string, options?: { force?: boolean }): Promise<void>;
    // rejects with the raw pg error (carrying `code`) on failure; does no classification of its own —
    // prepareTestDatabase classifies sweep-drop rejections via isObjectInUseError (55006) and
    // isDatabaseMissingError (3D000), skipping both and continuing the sweep; any other error is rethrown.
  createDatabase(maintenanceUrl: string, name: string): Promise<void>;      // separate call from dropDatabase — never combined in one statement
  migrate(testUrl: string): void;
}
export function prepareTestDatabase(ports: TestDatabasePorts): Promise<{ runName: string; testUrl: string }>;
// prepareTestDatabase calls findDotenvOverride(ports.env, ports.argv) and throws before any port call if it
// returns non-null — this is what gives the dotenv-override check a unit-testable home, instead of living
// only in untested global-setup.ts glue. It only returns the run name and URL; it does not mutate process.env.
// The thin, untested global-setup.ts glue assigns process.env.DATABASE_URL, process.env.SF_TEST_RUN_DATABASE
// and globalThis.__SF_TEST_RUN_DATABASE__ from that return value, after prepareTestDatabase resolves.
// On createDatabase failure (e.g. SQLSTATE 42P04, duplicate_database), prepareTestDatabase rethrows without
// calling dropDatabase — that name may belong to another run. dropDatabase on the run's own name is called
// only after createDatabase has succeeded, i.e. on a subsequent migrate failure. That force-drop of the run's
// own database never skips on any error code (55006/3D000 skipping applies only to sweep drops of *other*
// databases, never to a run dropping its own): it always rethrows the original migrate error once the drop
// attempt finishes; if the drop itself also fails, that failure is surfaced too (e.g. as a suppressed/cause
// error alongside the original migrate error), never swallowed.
```

Every DROP/CREATE identifier passed to Postgres by `prepareTestDatabase` and
by the teardown glue is double-quoted and comes only from a name that
already passed `isRunDatabaseName` (`planStaleSweep`'s own output, the
freshly generated `currentRunName`, or `planTeardownDrop`'s verified
result) — the anchored regex is the only authority on what a run database
name looks like, never a SQL `LIKE` pattern.

## Testing Strategy (Strict TDD, ADR-016)

| Layer | What | How |
|---|---|---|
| Unit (red first) | Run-name generation: matches `isRunDatabaseName`, stays under the 63-byte identifier limit, two calls never collide within a `Date.now()` millisecond (random component), and the embedded timestamp round-trips through `parseRunDatabaseCreatedAt`. Derive: swaps only the database name to the given run name; keeps user, percent-encoded password, host, port and `?schema=public`; idempotent; rejects a missing URL, a garbage URL and a `mysql:` URL. Guard (`assertTestDatabaseUrl`): rejects `sfmanager`, the bare `sf_manager_test`, other names and `undefined`; no password in the message. Worker guard (`assertWorkerDatabase`): passes when the derived name equals `SF_TEST_RUN_DATABASE` and that name passes `isRunDatabaseName`; throws when the names differ even if both are valid `sf_manager_test_*` names; throws when both channels agree on a name that is **not** a valid run name (for example both hold `sfmanager`), covering the case a bare equality check would wrongly pass; and throws when either value is missing. Override: an env var of any value (including `"false"`) and the argv form are both detected. Integration spec paths are recognized with both separators. `isRunDatabaseName`: matches the exact shape `^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$` only; rejects `sfmanager`, the bare `sf_manager_test`, and a lookalike such as `sf_manager_test_backup` (wrong shape after the prefix). `parseRunDatabaseCreatedAt`: returns the embedded timestamp (ms since epoch) for a valid run name whose timestamp is on or after the plausible-epoch floor (2026-01-01T00:00:00Z); returns `null` for `sf_manager_test_backup` (does not match the exact shape); returns `null` for a syntactically valid run name whose embedded timestamp is before the plausible-epoch floor; returns `null` for any other unparseable or non-run name. `planStaleSweep`: a name aged 23h59m is kept, a name aged just over 24h is dropped, a name with an unparseable or missing timestamp is kept, a name with a future timestamp is kept; excludes the current run name; and — as lookalike-name coverage — `sfXmanagerXtestX...`, an uppercase name, a name containing quotes or a hyphen, `sf_manager_test_backup`, and `sfmanager` are never selected, because `isRunDatabaseName` excludes them before the age check runs. `isObjectInUseError`: recognizes SQLSTATE 55006 and rejects other codes, as the secondary safety check only. `isDatabaseMissingError`: recognizes SQLSTATE 3D000 and rejects other codes. `planTeardownDrop`: returns the drop instruction for a valid run name; returns `null` (no drop) for a name that fails `isRunDatabaseName`. `stripUtf8Bom`: strips a leading BOM before `dotenv.parse`; leaves BOM-free text unchanged. `toMaintenanceUrl`: swaps the URL's database path to `postgres` and keeps the query string (`?schema=public`) unchanged. `findDotenvOverride`: given an env record with a dotenv-override trigger set, returns the trigger name; returns `null` when no override is set. | `npm test` |
| Unit | `prepareTestDatabase`: generates the run name via `generateRunDatabaseName(ports.now())` and feeds that same `now()` value into `planStaleSweep`, so both use one consistent clock reading per run. On a guard failure (`assertTestDatabaseUrl` or `findDotenvOverride(ports.env, ports.argv)`), throws **before** any `listDatabases`/`dropDatabase`/`createDatabase`/`migrate` call — including a dedicated case where `ports.env` shows a dotenv-override trigger, so `prepareTestDatabase` throws and no port is called at all, and a dedicated case where `ports.now()` produces a malformed run name (for example a `now` value above `36^8` ms, so `generateRunDatabaseName` would emit a 9-character timestamp instead of 8), so the generated-name-shape guard (misconfiguration (i)) throws and no port is called at all. Order is: `listDatabases` (all `pg_database.datname`, no SQL `LIKE` filter) → filter to run names via `isRunDatabaseName` → `planStaleSweep` selects by age → drop each selected name, classifying each `dropDatabase` rejection itself via `isObjectInUseError` (55006 → skip, continue) and `isDatabaseMissingError` (3D000 → skip, continue; the fake `dropDatabase` rejects with `{ code: '3D000' }` to prove the sweep continues on to create its own database), rethrowing any other error → create own run database → migrate → return `{ runName, testUrl }`. It does not mutate `process.env`. `dropDatabase` and `createDatabase` are always invoked as separate port calls, never combined. When `createDatabase` rejects with SQLSTATE 42P04 (`duplicate_database`), `prepareTestDatabase` rethrows **without** calling `dropDatabase` — the fake `createDatabase` port is asserted as the last port call, and `dropDatabase` is asserted as never called, since that name belongs to another run. When `createDatabase` succeeds but the subsequent `migrate` fails, it calls `dropDatabase` on its own run name (force) before rethrowing; this force-drop never skips on any error code — it always rethrows the original migrate error, and if the drop itself also fails, that failure is surfaced too. `migrate` receives the run URL. | Recording fakes |
| Unit | `assertWorkerDatabase(env)`, called from `TestDatabaseEnvironment.setup()` and again from `handleTestEvent('run_start')`: aborts (throws) against a fake env snapshot when the derived `DATABASE_URL` name does not equal `SF_TEST_RUN_DATABASE`, or when either is missing; also aborts when both channels agree on a name that is not itself a valid run name — for example `DATABASE_URL` derives `sfmanager` and `SF_TEST_RUN_DATABASE` is also `sfmanager`, which a bare equality check would wrongly pass; passes only when the names match **and** that name passes `isRunDatabaseName`. | `npm test`, fakes for the env snapshot |
| Unit | `planTeardownDrop(runName)`: returns the drop instruction for a name that passes `isRunDatabaseName`; returns `null` for one that does not, so `global-teardown.ts`'s glue never issues a DROP in that case. | `npm test` |
| Integration | The isolation spec (imports `dotenv/config` first, like the real specs) asserts `current_database()` matches `^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$`, is not `sfmanager`, and equals `process.env.SF_TEST_RUN_DATABASE`. Written first: it fails under today's config, because there is no run database yet — only the assertion exists, not the harness. Once the harness lands, the same assertion, unmodified, must pass — proving the harness satisfies it, not that the assertion changed. Then the full suite, with the 3 concurrency specs unmodified, and with the discovery-step fixture fixes (Decision 11) applied so all FKs hold. | `test:integration` |
| Integration | `app.integration.spec.ts` body unchanged, green, plus a `current_database()` assertion matching the run-name pattern and equal to `process.env.SF_TEST_RUN_DATABASE`, proving the renamed spec also targets its run database under the integration config. | `test:integration` |
| Manual (success criteria) | Dev row counts and the admin before and after a full run (`psql`). `DOTENV_CONFIG_OVERRIDE=true npm run test:integration` aborts in `globalSetup`. A stray `npx jest` run fails in the tripwire. Two concurrent `test:integration` runs: each gets its own database, both pass, and a manual `psql` check confirms neither run's database was dropped by the other's sweep. `test:e2e` still passes with no Docker running against the 10 specs that stub `PrismaService`. The unit test count is unchanged apart from the new harness unit specs; the unit run still needs no database. A scratch integration spec that sets `this.global.process.env.DATABASE_URL` (the sandbox env, at spec-import time, mimicking a rogue `dotenv/config` re-import) to the dev database's URL MUST abort at `run_start`, proving the re-check reads the sandbox env and not a stale outer copy. | Recorded in apply-progress |

The `globalSetup`/`globalTeardown` orchestration wiring, `test-database.environment.ts`'s
glue, and the tripwire's CLI-level effect are thin glue, proved by the
isolation spec and the manual checks rather than by unit tests — no file
under `test/` carries its own unit tests; every decision it calls into
(the worker guard, the teardown decision, the run-name generation, the
guard predicate, and the age-based stale-sweep decision, including the
55006 and 3D000 skips) lives in `src/shared/testing` and gets unit tests
as listed above because it is pure decision logic reachable with fakes.

## Migration / Rollout

No schema change. Stacked-to-main, 3 PRs, ordered so `main` is never left
red between merges:

| # | PR | Code | Test | Est. lines |
|---|---|---|---|---|
| 1 | Pure harness modules + unit specs (`test-database.ts` — now also the timestamp/sweep-age functions, `planTeardownDrop`, `assertWorkerDatabase` and `stripUtf8Bom` — plus `prepare-test-database.ts`) + `tsconfig.build.json` exclusion | ~210 | ~370 | ~580 |
| 2 | Discovery-step fixture fixes (Decision 11): correct any fixture that violates a migration-defined FK, found by a local discovery run of the harness built in PR 3's working tree | TBD after discovery | — | TBD after discovery |
| 3 | Harness switch: `globalSetup`/`globalTeardown` (including the `globalThis` handoff and `SF_TEST_RUN_DATABASE` publish), `TestDatabaseEnvironment` (thin, calls `assertWorkerDatabase`), tripwire + unit-config line, `jest-integration.json`, `test:integration` script, `app.e2e-spec.ts` → `app.integration.spec.ts` rename + assertion + header-comment fix, isolation spec, README/CLAUDE.md edits (including removing the "never run the full suite" warning and documenting the 24h stale-database retention note — true only once this PR lands) | ~190 | ~100 | ~290 |

PR 1's code estimate grew from ~160 to ~210 lines (timestamp parsing,
age-threshold sweep selection, the teardown decision, the worker-equality
guard and the BOM strip are all new pure functions), and its test estimate
grew from ~270 to ~370 lines (the added 23h59m/>24h/unparseable/future-timestamp
cases, the four lookalike-name cases, and the new functions' own unit
specs). The resulting ~580-line total is well over the 400-line budget,
but **all of the growth is in code and its matching unit tests for pure
functions, not incidental scope** — the same size-exception convention
`CLAUDE.md` already allows for test-heavy PRs applies, and PR 1's own code
line count (~210) is a smaller, more reviewable share of the total than the
test count. Flagging it explicitly: **PR 1 code alone is ~210 lines —
past the ~200-line code-only mark that would keep it comfortably small,
though still well under the 400-line total budget — so it is worth
considering a split** — for example PR
1a (`test-database.ts` pure functions + specs, ~120 code / ~230 test) and
PR 1b (`prepare-test-database.ts` orchestration + specs, ~90 code / ~140
test) — if the user prefers two reviewable chunks over one exception-sized
PR. Absent that preference, PR 1 proceeds as a single PR under the
size-exception convention. PR 3 (~290) stays closer to budget but touches
several files at once (config, environment, script, rename, docs);
flagging it as the one to watch if fixture-fix discovery (PR 2) turns out
to also touch harness files.

The tripwire moves to PR 3 with the rest of the integration wiring: until
PR 3 lands, `test:integration` still reuses the unit `jest` block through
CLI overrides (E7), so a tripwire merged in PR 1 alone would fail every
integration run for the wrong reason. Landing it together with
`jest-integration.json` means the unit run picks up the tripwire at the
same time the integration run stops reusing the unit config.

PR 2 (fixture fixes) is ordered **before** PR 3 (the harness switch) so
that once PR 3 merges and the harness starts enforcing FKs for real, the
fixtures already hold — `main` is never left with a merged harness that
fails its own suite. The discovery run itself happens locally against the
harness as it exists in PR 3's working tree (or a throwaway migrated
database), before PR 2 is written; PR 2 lands only the fixture corrections
it found. If the count of FK-violating fixtures is large, apply escalates
to the user before continuing.

After PR 3, the user runs the dev reset once. Rollback: revert PR 3 first,
then PR 2 (fixture fixes, safe to drop independently), then PR 1, and drop
any leftover `sf_manager_test_*` databases (no single fixed
`sf_manager_test` database to drop anymore). The dev reset cannot be
undone, and that is accepted.

## Open Questions

- [x] Confirm recreate instead of truncate (Decision 4, E8). Resolved 2026-09-24: user approved recreate.
- [x] The fresh test database enforces the hand-written FKs that the dev volume lacks (E9). Resolved 2026-09-24: fix violating fixtures inside this change as harness fallout; escalate to the user before continuing if the count turns out large.
- [x] A unique per-run database instead of a fixed `sf_manager_test`, with no advisory lock. Resolved 2026-09-25: user approved (Decision 4, Decision 10).
- [x] `app.e2e-spec.ts` moved under the integration run instead of `jest-e2e.json` gaining `globalSetup`. Resolved 2026-09-25: user approved (Decision 8).
- [ ] Refresh the stale "shared dev DB" comments (`prisma-user.repository.integration.spec.ts:13-17`, `organization-profile-migration.integration.spec.ts:63-76`) in PR 3, or defer them?
