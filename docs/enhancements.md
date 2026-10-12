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

## Done

None yet.
