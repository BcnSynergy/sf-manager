# Integration Test Isolation

## Purpose

Which database the real-DB tests use (every `*.integration.spec.ts` file,
including the renamed `test/app.integration.spec.ts`), how a fresh,
uniquely named database is prepared for each run, and the guard that keeps
those runs away from the dev database `sfmanager`. `test:e2e` (the rest of
the `*.e2e-spec.ts` suite) is unaffected by this change and keeps needing no
database. Test-harness only: no domain behaviour, no web UI, no
production-code guard (ADR-013). Deferred items are listed in the proposal.

## Requirements

### Requirement: Real-DB Test Runs Use Only Their Own Run Database

Every integration run MUST read and write only the database created for
that run, named `sf_manager_test_<id>`. It MUST NOT create, modify or
delete any row in the dev database, and MUST NOT touch any other run's
database.

#### Scenario: Full integration run leaves dev data untouched (procedural check)

- GIVEN the dev database with the seeded admin active, and its per-table row counts recorded
- WHEN the full integration suite runs
- THEN the dev database's per-table row counts equal the recorded ones
- AND the seeded admin is still active (not soft-deleted)

#### Scenario: Renamed health spec runs against its run database

- GIVEN the run database is reachable
- WHEN the integration run executes `test/app.integration.spec.ts`
- THEN it passes, and its connection targets that run's `sf_manager_test_<id>` database
- AND `current_database()` matches the run-name pattern and equals `process.env.SF_TEST_RUN_DATABASE`

### Requirement: Per-Run Test Database Preparation

At the start of each integration run, before any spec executes, the harness
MUST generate a unique run database name, sweep stale run databases left
over by earlier runs, create its own run database, and apply all
migrations. This sweep-create-migrate sequence MUST happen exactly once per
run: not per spec file, and not at teardown.

#### Scenario: First run on a fresh machine

- GIVEN no `sf_manager_test_*` database exists in the docker-compose Postgres
- WHEN an integration run starts
- THEN a uniquely named run database is created and fully migrated before the first spec runs
- AND the suite runs against it

#### Scenario: A fresh run database starts empty every time

- GIVEN a new integration run starts
- WHEN its run database is created and migrated
- THEN it holds exactly the freshly migrated state (including rows that migrations insert, such as the `OrganizationProfile` singleton)
- AND rows written by earlier spec files in the same run are not cleared before later spec files run

### Requirement: Concurrent Runs Are Isolated

Two integration runs started at the same time MUST each get their own
database, and neither MUST drop a database created by another run within
the retention threshold, whether or not that database currently has open
connections. The stale-database sweep (Per-Run Test Database Preparation)
MUST select for removal only databases whose embedded creation timestamp
is older than the retention threshold (`STALE_RUN_DATABASE_AGE_MS`, 24
hours); a database with an unparseable or missing embedded timestamp MUST
NOT be dropped. As a secondary safety check, the sweep MUST also skip any
database it attempts to drop when Postgres reports the database is in use
(SQLSTATE 55006) or that the database no longer exists (SQLSTATE 3D000,
for example because another concurrent run's sweep already dropped it
first), instead of failing the sweeping run in either case. A crashed
run's database may therefore linger for up to 24 hours; this is accepted
for local use.

#### Scenario: Two concurrent runs each get their own database

- GIVEN two integration runs start at the same time
- WHEN each generates its run database name and creates it
- THEN each run ends up with its own uniquely named database
- AND neither run drops the other's database

#### Scenario: A live run's database with zero open connections is not dropped by a concurrent run's sweep

- GIVEN a `sf_manager_test_*` database created by a live run, with an embedded creation timestamp less than 24 hours old, and currently zero open connections to it (for example between its `CREATE DATABASE` and `migrate deploy`, or between spec files)
- WHEN a new run's stale sweep executes
- THEN the sweep does not select that database for removal, because its embedded timestamp is within the retention threshold
- AND the live run's database remains intact regardless of whether it currently has any open connections

#### Scenario: The stale sweep removes an unused leftover database

- GIVEN a `sf_manager_test_*` database left over by a run that finished without teardown running, with an embedded creation timestamp older than the 24-hour retention threshold
- WHEN a new run's stale sweep executes
- THEN that leftover database is dropped

#### Scenario: The stale sweep skips a database in use by a live run

- GIVEN a `sf_manager_test_*` database with an embedded creation timestamp older than the 24-hour retention threshold (so it is age-eligible for the sweep), currently held open by a live run
- WHEN a new run's stale sweep attempts to drop it and Postgres reports the database is in use (SQLSTATE 55006)
- THEN the sweep skips that database instead of failing, as a secondary safety check
- AND the new run proceeds to create and use its own database

#### Scenario: A stale database dropped concurrently by another run is skipped, and the run proceeds

- GIVEN a `sf_manager_test_*` database with an embedded creation timestamp older than the 24-hour retention threshold (so it is age-eligible for the sweep)
- WHEN a new run's stale sweep attempts to drop it, but another concurrent run's sweep already dropped that same database first, so Postgres reports the database does not exist (SQLSTATE 3D000)
- THEN the sweep skips that database instead of failing, as a secondary safety check
- AND the new run proceeds to create and use its own database

#### Scenario: A syntactically similar but non-run-shaped database is never swept

- GIVEN a database named `sf_manager_test_backup`, which does not match the exact run-name shape `^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$`
- WHEN a new run's stale sweep executes
- THEN that database is never selected for removal, regardless of its age, because it does not pass `isRunDatabaseName`

### Requirement: Fail-Fast Target Guard

A real-DB run MUST abort, printing a message naming the expected database
and the reason, when any of the following hold: (i) the generated run
database name does not match the exact-shape anchored run-name pattern
`^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$`, checked before any
destructive operation (drop, create, migrate) and before any spec runs;
(ii) a test worker's effective `DATABASE_URL`, with its database name
parsed from the URL, does not equal the run name published by
`globalSetup` through the second channel `SF_TEST_RUN_DATABASE`, rather
than pattern-matching alone — checked in that worker before it executes
any spec query (the harness's own destructive operations have already
completed in the parent process by the time any worker starts, so this
check is a hard stop on spec queries, not on drop/create/migrate); (iii) a
dotenv override trigger (`DOTENV_CONFIG_OVERRIDE`) is set, so a spec's
`dotenv/config` import could overwrite the worker's `DATABASE_URL`,
checked before any destructive operation and before any spec runs; (iv)
the base connection URL is missing or unparseable, checked before any
destructive operation and before any spec runs. The harness itself
connects to the maintenance database `postgres` for the sweep, create and
drop operations; only `prisma migrate deploy` and the test workers connect
to the run database, and only those connections are subject to check
(ii).

| Misconfiguration | Outcome |
|---|---|
| Base URL is missing or unparseable | Abort before any destructive operation |
| The generated run database name does not match `^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$` | Abort before any destructive operation |
| A dotenv override trigger (`DOTENV_CONFIG_OVERRIDE`) is set, so a spec's `dotenv/config` import could overwrite the worker's `DATABASE_URL` | Abort before any destructive operation |
| A test worker's effective `DATABASE_URL`, database name parsed from the URL, does not equal the run's published `SF_TEST_RUN_DATABASE` name | Abort before that worker executes any spec query |

#### Scenario: Misconfigured run aborts

- GIVEN the base connection URL is missing, unparseable, or the generated run database name does not match `^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$`
- WHEN an integration run starts
- THEN the run exits with a failure and a clear message
- AND no drop, create, migration or spec query has executed against any database

#### Scenario: A dotenv override trigger aborts the run

- GIVEN `DOTENV_CONFIG_OVERRIDE` is set to any value, including `"false"`
- WHEN an integration run starts
- THEN the run aborts before any destructive operation, with a message naming the override trigger

#### Scenario: A worker that resolves the dev URL is stopped

- GIVEN a test worker whose own environment loading resolves a `DATABASE_URL` whose parsed database name does not equal the published `SF_TEST_RUN_DATABASE` run name
- WHEN that worker starts
- THEN it aborts before executing any spec query

### Requirement: Teardown Drops Only Its Own Run Database

`globalTeardown` MUST drop exactly the database named by the run, passed
from `globalSetup` via `globalThis` rather than re-parsed from the
environment, MUST verify that name passes `isRunDatabaseName` before
issuing the drop, and MUST NOT drop any other database.

#### Scenario: Teardown drops the run's own database

- GIVEN `globalSetup` published its run name via `globalThis`
- WHEN `globalTeardown` executes
- THEN it drops exactly that database, and no other

#### Scenario: Teardown refuses a name that fails the run-name pattern

- GIVEN the value passed via `globalThis` does not pass `isRunDatabaseName`
- WHEN `globalTeardown` executes
- THEN it throws a clear error naming the invalid value
- AND it issues no DROP

### Requirement: Unit Test Run Is Unaffected

The unit test run MUST NOT trigger test-database creation, drop, migration
or the target guard, and MUST NOT require a running database.

#### Scenario: Unit run without database

- GIVEN Postgres is not running
- WHEN the unit test run executes
- THEN it completes with the same results as before this change, apart from the new harness unit specs; the unit run still needs no database

### Requirement: Concurrency Specs Pass Unmodified

The three existing real-concurrency integration specs MUST pass against the
test database without changes to their source.

#### Scenario: Concurrency specs on the test database

- GIVEN the concurrency spec files are unchanged
- WHEN the integration suite runs
- THEN all three pass

### Requirement: Fixtures Honor Migration-Defined Foreign Keys

Every integration spec MUST pass against the freshly migrated test database
with all migration-defined foreign keys enforced. A fixture that violates a
foreign key MUST be corrected so the constraint holds; it MUST NOT be skipped
or disabled.

#### Scenario: Fixtures pass with FKs enforced

- GIVEN the run database is freshly created and migrated, with all migration-defined foreign keys enforced
- WHEN the integration suite runs
- THEN every spec passes without skipping or disabling any foreign key

### Requirement: Documented Dev-Database Reset and Full-Suite Guidance

Project documentation MUST describe a one-time dev-database reset
(`prisma migrate reset`, then run the seed) and the run database naming
scheme and 24h retention. `CLAUDE.md` MUST NOT forbid running the full
integration suite; its *Dev-DB pollution* guidance MUST reflect that each
real-DB run uses its own uniquely named run database, so concurrent runs
are isolated and safe to run at the same time.

#### Scenario: Reset restores seeded users (manual procedure)

- GIVEN a polluted dev database
- WHEN the documented reset is followed
- THEN the dev database holds only seeded data, including an active seeded admin

#### Scenario: Full-suite warning removed (manual doc review)

- GIVEN the updated `CLAUDE.md` and `README.md`
- WHEN a reviewer reads them
- THEN no instruction forbids the full integration suite
- AND the reset procedure and the run database naming scheme and 24h retention are documented
