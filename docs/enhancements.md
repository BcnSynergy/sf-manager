# Enhancements

Register of optional improvements to SF-Manager: things that would make the
system better but that nothing currently requires. Known defects, gaps, and
shortcuts live in [technical-debt.md](technical-debt.md); new product
behavior belongs in `docs/requirements/functional-requirements.md`.

## How to use this file

- Each item has a stable ID (`EN-<n>`). IDs are never reused or renumbered.
- New items go at the end of **Open** with the next free number. Include the
  area, the evidence (file path or source review), and the origin.
- Typical sources: non-blocking suggestions from fresh-context reviews, RDD
  reviews, `sdd-verify`, and `sdd-archive` follow-ups.
- When an item is done, move it to **Done** with the change name and PR
  numbers. If it is dropped, move it to **Done** marked "dropped" with a
  one-line reason.
- If an item turns out to fix a real gap, add it to
  [technical-debt.md](technical-debt.md) with the next free `TD-<n>` and
  "(ex EN-<n>)", and move the EN item to **Done** marked "moved to TD-<n>".

## Open

- **EN-1** (web tests): Assert that no `<caption>` renders in the loading and
  error states of the table pages. Today only the CommunitiesList empty state
  is asserted; the other states are browser-verified only. Origin:
  `table-accessibility` RDD review and `sdd-verify`, 2026-10-09.
- **EN-2** (web tests): Assert that each `<caption>` is the table's first
  child, as `web-table-accessibility` requires. It is browser-verified only.
  Origin: `table-accessibility` RDD review, 2026-10-09.
- **EN-3** (web tests): Test that captions follow the active language on the
  grouped pages (ReviewTemplatesList, ChecklistQuestionsList). Today only
  ReviewSchedule has a non-English caption test. Origin:
  `table-accessibility` RDD review and `sdd-verify`, 2026-10-09.
- **EN-4** (specs): Reword the two scenarios in
  `openspec/specs/web-table-accessibility/spec.md` that compare against the
  state "before this change" ("Pages with no table are unchanged" and "No new
  strings"). In a living spec they cannot be checked. For example, state that
  each caption uses the same translation key as its heading. Origin:
  `table-accessibility` archive RDD review, 2026-10-09.
- **EN-5** (api): Unmap the other IPv6 forms that embed an IPv4 address in
  the login throttle key. Today only IPv4-mapped (`::ffff:a.b.c.d`) becomes
  IPv4. IPv4-compatible (`::a.b.c.d`) and NAT64 (`64:ff9b::/96`) addresses
  collapse into one `/64` bucket each, so behind a NAT64 translator one client
  could throttle all translated clients. No documented topology does this.
  Evidence: `apps/api/src/modules/auth/presentation/guards/client-key.ts`.
  Origin: `login-rate-limit-hardening` PR 1 RDD review (R1-001), 2026-10-12.
- **EN-6** (api): Hash the throttle key with an HMAC (secret-keyed) instead of
  the library's unsalted SHA-256. An IPv4 key has only 2^32 values, so the
  stored hash can be enumerated: today the key is pseudonymized, not
  anonymized, at rest. Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`
  (key stored as received from the library). Origin:
  `login-rate-limit-hardening` reviews and `sdd-verify`, 2026-10-12.
- **EN-7** (api tests): Close the client-key and guard test gaps. Add rows for
  `1::`, `1:2:3:4:5:6:7::`, `::2:3:4:5:6:7:8`, uppercase hex, and an IPv4 with
  a zone id (`1.2.3.4%x` is accepted as IPv4). Pin the IPv4-compatible
  `::a.b.c.d` behavior that EN-5 describes. The guard "shared key" unit test
  also passes on the base `ThrottlerGuard`; pin the sha256 of
  `AuthController-login-default-unresolved` so it fails on the base guard.
  Evidence: `apps/api/src/modules/auth/presentation/guards/client-key.spec.ts`;
  `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.spec.ts`.
  Origin: `login-rate-limit-hardening` reviews and `sdd-verify`, 2026-10-12.
- **EN-8** (docs): Note in the README that a `TRUST_PROXY` larger than the real
  proxy count makes the client-controlled leftmost `X-Forwarded-For` entry the
  key, even with no proxy chain at all. Evidence: `README.md` (`TRUST_PROXY`
  section). Origin: `login-rate-limit-hardening` reviews, 2026-10-12.
- **EN-9** (api): Improve the adapter SQL readability. The three `CASE`
  ladders repeat the same predicates without state labels; the expiry boundary
  uses `<=` in the upsert and `<` in the cleanup; the `totalHits === 1`
  cleanup trigger relies on the `CASE` layout. Also, with a limit below 1 the
  first hit of a window is never blocked (unreachable today: the config rejects
  non-positive values). Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`.
  Origin: `login-rate-limit-hardening` PR 2 RDD review, 2026-10-12.
- **EN-10** (api tests): Close the adapter and integration test gaps. No case
  uses `ttl != blockDuration` (60 s/1 s and 1 s/60 s); the 1000 ms windows
  could flake on slow CI (widen to about 3000 ms); no app-level
  window-elapsed test runs over Postgres. Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.integration.spec.ts`;
  `apps/api/test/login-rate-limit.integration.spec.ts`;
  `login-rate-limit-hardening` verify-report S-1. Origin:
  `login-rate-limit-hardening` reviews and `sdd-verify`, 2026-10-12.
- **EN-11** (test harness): Tidy the rate-limit test harness. Extract a shared
  e2e helper for the `ThrottlerStorage` override plus the `PrismaService` mock
  (duplicated in 13 e2e chains and unexplained at the call sites). The
  integration spec keeps its apps open until `afterAll`. The fail-closed test
  should assert the storage spy was called and that the 500 body leaks no
  storage details. The comment in `rate-limit-env.setup.ts` is in future tense.
  Evidence: `apps/api/test/login-rate-limit.integration.spec.ts`;
  `apps/api/test/login-rate-limit.e2e-spec.ts`;
  `apps/api/test/test-database/rate-limit-env.setup.ts`. Origin:
  `login-rate-limit-hardening` PR 3 RDD review, 2026-10-12.
- **EN-12** (api): Map counter-storage failures to `503` with `Retry-After` and
  a distinct log label instead of a generic `500`, so a storage outage can be
  told apart from a bug. Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`
  (fails closed with a generic error today); spec "Counters ... fail closed"
  behavior in `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`
  (2026-10-12 addendum). Origin: `login-rate-limit-hardening` reviews,
  2026-10-12.
- **EN-13** (api tests): Prove at boot level that an invalid `TRUST_PROXY`
  stops the app before it serves requests. Today only the parser is
  unit-tested (`trust-proxy.spec.ts`); that `main.ts` calls it before
  `listen` is checked by reading the code only, so a reorder would go
  unnoticed. Evidence: `apps/api/src/main.ts`,
  `apps/api/src/shared/infrastructure/env/trust-proxy.spec.ts`. Origin:
  `login-rate-limit-hardening` archive RDD review, 2026-10-12.

- **EN-14** (web tests): Pin the defensive epoch advances. The
  `advanceSessionEpoch()` calls in `logout()` and in the unauthorized handler
  (`apps/web/src/auth/AuthProvider.tsx:117`, `:72`) have no test that fails
  without them, and the logout-only stale test
  (`apps/web/src/auth/AuthProvider.test.tsx:312`) passes even without the
  fix, because the `userRef` null check already covers it. Either find an
  observable case or accept them as documented defensive code. Origin:
  `stale-401-session-guard` tasks C.5/C.6 and `sdd-verify`, 2026-10-13.
- **EN-15** (web tests): Pin the ordering in `login()`: the epoch advance
  must run before `response.json()` and `updateUser`
  (`apps/web/src/auth/AuthProvider.tsx:100`). The re-login stale test
  (`apps/web/src/auth/AuthProvider.test.tsx:287-310`) does not fail if the
  advance moves after them. Origin: `stale-401-session-guard` `sdd-verify`,
  2026-10-13.
- **EN-16** (web tests): Tidy `AuthProvider.test.tsx`. The stale-401 tests
  repeat the same scaffold (`:287-363`; extract a helper), the stale-logout
  test title is ambiguous (`:335`; say it covers logout followed by a new
  login), and the comment "Any data call: the API answers 401" (`:173`)
  sits above the `options.data` branch instead of the default 401 response.
  Origin: `stale-401-session-guard` `sdd-verify`, 2026-10-13.
- **EN-17** (web tests): `apps/web/src/auth/session-ended-flow.test.tsx:15`
  stubs `fetch` with `vi.stubGlobal` but has no
  `afterEach(vi.unstubAllGlobals)`, unlike the repo convention (for example
  `apps/web/src/components/LanguageSelector.test.tsx:9`). Origin:
  `stale-401-session-guard` `sdd-verify`, 2026-10-13.
- **EN-18** (specs): Tidy the authentication spec and the archived design.
  In `openspec/specs/authentication/spec.md`, "Session ends mid-session" and
  "Current-session 401 ends the session and redirects" are near-duplicates,
  as are "Mid-session 401" and "Current-session 401 still shows the notice";
  merge or differentiate them. The Open Questions in
  `openspec/changes/archive/2026-10-13-stale-401-session-guard/design.md:254`
  are stale (both were settled in `sdd-tasks`/`sdd-design`). Origin:
  `stale-401-session-guard` `sdd-verify`, 2026-10-13.
- **EN-19** (web): The mount-time `/auth/me` restore does not advance the
  session epoch. It is unreachable as a problem today because
  `ProtectedRoute` renders no `apiFetch` caller while loading (see the
  ADR-011 2026-10-06 addendum, item 6). Revisit if a caller can run before
  the restore completes. Origin: `stale-401-session-guard` design, 2026-10-13.
- **EN-20** (api tests): Login-throttle cleanup test gaps in
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.integration.spec.ts`.
  The statement-timeout test only shows the timeout does not leak onto
  pooled connections; nothing proves the 500 ms bound applies to the cleanup
  `DELETE` or that a timeout is logged and the login still succeeds at
  integration level (the unit spec covers the logging). The "deletes fully
  expired rows even when more than 100 still-blocked rows have an ended
  window" test empties the
  whole table first, which couples it to other tests in the suite. The
  index test runs `EXPLAIN` on a copy of the cleanup SQL rather than the
  adapter's statement, so it would not notice the predicate drifting. The
  no-leak test relies on the pool reusing the cleanup's connection among a
  few parallel queries, which is likely but not guaranteed. The one-retry
  path in `increment()` is covered by unit tests only, and one seed helper
  still writes an explicit `expiresAt` that the trigger overwrites. Origin:
  `td-35-throttle-db-load` native review, 2026-10-13.
- **EN-21** (api): The window-end expression
  `date_trunc('milliseconds', now()) + ttl * interval '1 millisecond'` is
  repeated in the throttle upsert in
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`;
  computing it once (for example in a CTE) would make the SQL easier to read
  and change. Related to EN-9. Origin: `td-35-throttle-db-load` native
  review, 2026-10-13.
- **EN-22** (api): Login-throttle follow-ups from the `td-35-throttle-db-load`
  native review, 2026-10-13. The cleanup's interactive `$transaction` costs
  extra round trips (`BEGIN`, `set_config`, `DELETE`, `COMMIT`); a single
  statement or a batched transaction would be cheaper. Migration
  `20261013120000_throttle_counter_expires_at` rewrites every row and builds
  the index without `CONCURRENTLY`, so it locks the table for its duration
  (small today; revisit if the table grows). It also drops
  `ThrottleCounter_windowEndsAt_idx`, so after a code-only rollback the
  previous adapter's cleanup (which filters on `windowEndsAt`) falls back to a
  sequential scan; accepted while there is no production deployment
  (TD-32). `ThrottleCounter.expiresAt` is a
  required field in the Prisma client although the trigger owns it, so a
  future Prisma `create` would have to pass a value the trigger then
  overwrites. The cleanup's `$transaction` uses Prisma's default `maxWait`
  to acquire a connection, so under pool exhaustion the wait before the
  500 ms statement timeout applies is longer than that timeout suggests.
- **EN-25** (api): Tidy the SQL in
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.ts`.
  The upsert repeats the "new window" condition (`blockedUntil IS NOT NULL OR
  windowEndsAt <= now()`) four times and the window-end expression five
  times; computing each once (for example in a CTE or a single anchor) would
  state every rule once. Related to EN-9 and EN-21. Origin:
  `login-account-lockout` native review of PR 1/4 (#214), 2026-10-14.

## Done

- **EN-26** (api tests): Widened the 1000 ms windows in the login-failure
  limiter integration spec to 3 s so the window-expiry tests no longer race a
  slow CI runner. Done in `login-account-lockout`, PR #214.
