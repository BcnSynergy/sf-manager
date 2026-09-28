# Proposal: Hermetic Integration Tests

## Intent

The 24 `*.integration.spec.ts` files and `test/app.e2e-spec.ts` run
against the dev database `sfmanager`. Every run leaves fixture rows behind
and soft-deletes the seeded admin, so the full suite is banned as a routine
check (`CLAUDE.md`). That weakens Strict TDD (ADR-016).

Success: the full suite is safe to run at any time and never touches dev
data.

**Deliberately test-harness-only.** No domain behaviour and no web UI. The
ADR-006 "domain + UI" rule does not apply because this is not a domain
slice.

Context: `[[sdd/hermetic-integration-tests/explore]]`, ADR-006, ADR-013,
ADR-016.

## Scope

### In Scope

1. A test database, `sf_manager_test`, in the existing docker-compose
   Postgres container.
2. A Jest `globalSetup` for the integration run. It creates the database if
   it is missing, runs `prisma migrate deploy`, and truncates all tables
   **once per run**. Specs keep their unique ids and names.
3. A fail-fast guard that aborts the run unless the effective connection
   targets the test database. It covers all 24 integration specs and
   `test/app.e2e-spec.ts`, so e2e runs now need the test database.
4. Documentation for a one-time dev-DB reset (truncate, then
   `prisma db seed`). Losing manual dev data is accepted.
5. Removal of the "never run the full suite" warning, with the `CLAUDE.md`
   *Dev-DB pollution* bullet rewritten to match.

### Out of Scope (deferred)

- A `dev-seed-data` slice: QA users and realistic dev data in the seed.
- Fixtures that break domain invariants (351 of 355 `QuestionAnswer` rows
  point to questions missing from their frozen snapshot).
- Per-file truncation. Revisit only if specs start interfering with each
  other.
- Per-test rollback (it breaks the 3 real-concurrency specs),
  schema-per-worker and Testcontainers.
- CI (no `.github/workflows` exist).

## Capabilities

### New Capabilities

- `integration-test-isolation`: which database the real-DB tests use, how
  it is set up and reset for each run, and the fail-fast guard.

### Modified Capabilities

None.

## Approach

The harness is test-only and lives under `apps/api/test/`. There is no
guard in `PrismaService` (ADR-013). The design must resolve three points:

1. **Primary question: how the test URL reaches the workers.**
   `globalSetup` runs outside the test workers, so env vars it sets may not
   reach them. Five places load `dotenv/config`: 20 of the 24 integration
   specs, `app.e2e-spec.ts`, `auth.config.ts` and `prisma.config.ts`. The
   design must prove that the test URL wins in every worker, through
   `setupFiles`, a script-level env or a dedicated config. It must not
   assume dotenv's no-override default.
2. `test:integration` reuses the shared `jest` block in `package.json`. The
   new setup must not leak into the unit `test` run.
3. The guard must run before the truncate.

## Affected Areas

| Area | Impact |
|---|---|
| `apps/api/package.json` | Modified: integration and e2e scripts or config |
| `apps/api/test/**` (setup, guard) | New |
| `apps/api/test/jest-e2e.json`, `app.e2e-spec.ts` | Modified |
| `README.md` | Modified: test DB URL, dev reset |
| `CLAUDE.md` | Modified: *Dev-DB pollution* bullet |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Test URL does not reach the workers, so tests still hit the dev DB | High | Guard runs in every worker; success criterion 2 |
| Truncate hits the wrong DB | Med | Guard runs first |
| Concurrency specs regress | Low | Run them unmodified |

## Rollback Plan

Revert the PRs and drop `sf_manager_test`. The manual dev reset cannot be
undone, and that is accepted.

## Dependencies

- A running docker-compose Postgres. `POSTGRES_USER` is a superuser, so it
  can run `CREATE DATABASE`.

## Success Criteria

- [ ] After a full `test:integration` run, dev-DB row counts and the seeded
      admin are unchanged.
- [ ] A run pointed at `sfmanager` aborts before any query, with a clear
      message. (Amended 2026-09-25 — see Amendments below.)
- [ ] The 3 concurrency specs pass unmodified.
- [ ] On a fresh machine, the first run creates and migrates
      `sf_manager_test`.
- [ ] `app.e2e-spec.ts` passes against the test DB, and the unit `test`
      run is unaffected.
- [ ] The warning is removed and the reset is documented.

## Delivery

Small: about 150 to 300 changed lines in 1 or 2 PRs, `stacked-to-main`,
`ask-on-risk`.

## Amendments (2026-09-25)

Design and planning deviated from this proposal's text as follows. Each
item was approved by the user before the design was updated.

- **Correction: `auth.config.ts` does not load `dotenv/config`** (found
  during round-5 review). The Approach section's "five places load
  `dotenv/config`" list above (line 67) wrongly includes `auth.config.ts`;
  it only mentions `dotenv/config` in a comment, and does not import it.
  `prisma/seed.ts` and `src/main.ts` do import it, confirmed in code. This
  is a correction to this proposal's Approach text only; `design.md`
  Evidence E6 already states the correct fact and no design decision
  changes.
- **Recreate instead of truncate** (approved 2026-09-24). Scope item 2 and
  the Approach section describe truncating tables each run; the design
  instead drops and recreates the database. See `design.md` Decision 4,
  Evidence E8.
- **A per-run database instead of a fixed `sf_manager_test`, and no
  advisory lock** (approved 2026-09-25). Scope item 1 and the rest of this
  proposal assume one fixed database name, serialized across concurrent
  runs by a lock. The design instead generates a uniquely named
  `sf_manager_test_<id>` database per run, with a stale-database sweep
  replacing the lock; concurrent runs are isolated, not serialized. See
  `design.md` Decision 2, Decision 4, Decision 10.
- **Dev reset via `prisma migrate reset` + seed instead of truncate + seed**
  (approved 2026-09-24, tightened by the recreate decision above). Scope
  item 4 describes a truncate-based dev reset; the design uses
  `prisma migrate reset` (no `--force`) followed by `prisma db seed`. See
  `design.md` Decision 9.
- **`app.e2e-spec.ts` moved under the integration run instead of
  `jest-e2e.json` gaining `globalSetup`** (approved 2026-09-25). Scope item
  3 and the Approach section describe covering `test/app.e2e-spec.ts` by
  giving `jest-e2e.json` the same `globalSetup`/guard as the integration
  config, which would require the database container for all 11 e2e specs.
  The design instead renames the file to `test/app.integration.spec.ts` and
  runs it under the integration config; `jest-e2e.json` is unmodified. See
  `design.md` Decision 7, Decision 8.
- **FK fixture fixes in scope, via a discovery step** (already anticipated
  by this proposal's "Out of Scope" note on domain-invariant-breaking
  fixtures, but not by its Success Criteria or Delivery estimate). Resolved
  2026-09-24: fixing migration-defined-FK-violating fixtures is in scope,
  found by a discovery run and corrected in their own PR. See `design.md`
  Decision 11.
- **3-PR delivery instead of 1–2 PRs of 150–300 lines.** The Delivery
  section above estimates 150–300 lines in 1–2 PRs. With the lock removed,
  the per-run database added, and fixture fixes and their discovery step
  in scope, the design instead plans 3 PRs (pure harness + unit specs;
  fixture fixes; harness switch), ordered so `main` is never left red
  between merges. See `design.md` Migration / Rollout.
- **Success criterion 2 restated: worker-connection equality, not a
  "points at `sfmanager`" check** (approved 2026-09-25). The dev base URL
  (the checked-in `.env`) normally *does* point at `sfmanager`, and
  derivation replaces the database name before any connection is made, so
  a literal "base URL points at `sfmanager` → abort" guard would fire on
  the normal path, not just a misconfiguration. Success criterion 2 above
  is amended to: "a test worker whose effective connection is not the
  run's own database aborts before executing any spec query." The guard
  instead checks (i) the generated run name matches the anchored pattern
  before any destructive operation, and (ii) every worker's effective
  `DATABASE_URL`, with its database name parsed from the URL, equals the
  run name published by `globalSetup` through a second channel,
  `SF_TEST_RUN_DATABASE`, not the pattern alone — checked before that
  worker executes any spec query, not before the harness's own
  drop/create/migrate operations, which run only in the parent process
  before any worker starts. See `design.md` Decision 1, Decision 3, and
  the `integration-test-isolation` spec's Fail-Fast Target Guard
  requirement.
- **Pure harness functions live in `src/shared/testing/**`, excluded from
  the build** (approved 2026-09-25). Not previously stated: the run-name
  generation, URL derivation, guards, stale-sweep and teardown decisions
  are pure functions under `src/shared/testing`, unit-tested through
  `npm test`, and excluded from `dist` via `tsconfig.build.json` alongside
  the existing `**/*spec.ts` exclusion. See `design.md` File Changes,
  Interfaces / Contracts.
- **A second publish channel, `SF_TEST_RUN_DATABASE`** (approved
  2026-09-25). Not previously stated: `globalSetup` publishes the run name
  itself, not only the derived `DATABASE_URL`, so workers and teardown can
  check equality against the run's own name instead of relying on pattern
  match alone. See `design.md` Decision 1, Decision 3.
- **Age-based stale-database sweep (24h retention) instead of a
  connection-state-only sweep** (approved 2026-09-25). The original design
  relied on Postgres reporting SQLSTATE 55006 (object in use) to protect a
  live run's database from a concurrent sweep. A live run has zero-connection
  windows (between `CREATE` and `migrate`, between spec files, during
  connectionless parity specs) during which 55006 never fires, so a
  connection-only sweep could drop a live run's database. The design
  instead embeds each run's creation time in its database name and selects
  only databases older than `STALE_RUN_DATABASE_AGE_MS` (24 hours) for
  removal, keeping the 55006 check as a secondary safety net. A crashed
  run's database may linger for up to 24 hours; accepted for local use.
  See `design.md` Decision 2, Decision 4, Decision 10.
