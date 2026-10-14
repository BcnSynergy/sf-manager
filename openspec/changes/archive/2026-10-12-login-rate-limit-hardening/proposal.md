# Proposal: Login rate-limit hardening (TD-28, TD-29, TD-30)

## Intent

The `login-rate-limit` change (archived 2026-10-07) added a per-IP throttle on `POST /auth/login`, but left four known weaknesses in the technical-debt register:

- **TD-28**: `TRUST_PROXY` only supports off or exactly one hop. Behind a CDN plus a proxy, every client shares one bucket. With `true` and no proxy, clients can spoof their key.
- **TD-29**: IPv6 clients can rotate the low 64 bits of their address to get a fresh bucket for each attempt.
- **TD-30**: counters live in memory, so a restart or redeploy resets them. Several instances (horizontal scaling or serverless) each keep their own counters, which multiplies the effective limit.
- **TD-31**: there is no per-email keying or account lockout.

The production topology is still unknown. The deploy target may be a VPS or a serverless platform such as Vercel. This change makes the throttle correct across every candidate topology without having to choose one. TD-28, TD-29 and TD-30 are resolved here. TD-31 is deliberately deferred to its own slice.

## Scope

### In Scope

- **TD-28: `TRUST_PROXY` hop count.**
  - `getTrustProxySetting()` accepts unset, `''` or `'false'` (off), `'true'` (one hop, unchanged), or a positive integer N (trust N hops).
  - Boot fails fast on `0`, negative numbers, non-integers and any other value.
  - CIDR lists and named values (`loopback` and similar) are not accepted.
  - There is no production default; off remains the default.
  - A topology-to-value table covers: no proxy, one reverse proxy, CDN plus reverse proxy, and a PaaS such as Vercel. It goes in `README.md` and the new ADR-011 addendum. The PaaS row instructs the operator to confirm the platform's forwarding hops and does not assert a value.
- **TD-29: IPv6 /64 keying.**
  - The login throttle tracker keys IPv6 clients by their /64 prefix. IPv4 is unchanged.
  - IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is treated as the IPv4 address.
  - An undefined or unparsable `req.ip` is handled defensively, without throwing and without bypassing the limit.
- **TD-30: Postgres-backed throttle storage.**
  - A `ThrottlerStorage` implementation persists counters in Postgres through Prisma: a new model, a migration and an adapter.
  - The increment is atomic, so concurrent requests on one or more instances cannot lose hits.
  - Expired rows are cleaned up by a strategy chosen in design. It must not depend on a long-running process, because serverless is possible.
  - The limit survives restarts and is shared across multiple or serverless instances.
  - Accepted cost: one extra DB write per login attempt.
- **Spec and docs.**
  - `authentication` delta spec.
  - ADR-011 addendum covering open questions 1 to 4 of the 2026-10-07 addendum.
  - `README.md` env documentation.
- **Register updates.** TD-28, TD-29 and TD-30 move to Resolved in `docs/technical-debt.md`, with the change name and PR numbers, at the end of the chain. TD-31 stays open.

### Out of Scope

- **TD-31: per-email keying and account lockout.** These are deferred to a future slice of their own and TD-31 stays open in the register. The reasons: the guard runs before body validation, a per-email limit allows a targeted denial of service on a victim account, it carries a user-enumeration risk, and true lockout needs an unlock flow and UI.
- **Redis** or any other new infrastructure component.
- CIDR or named `TRUST_PROXY` values.
- Choosing or configuring the production topology, the deploy pipeline, or a Dockerfile.
- Revisiting ADR-001 for a serverless or shared deploy. This is recorded as an open question only.
- Throttling any endpoint other than `POST /auth/login`.
- **Any web UI change.** API-only is deliberate and was confirmed by the user. This is backend security hardening with no new user-facing behavior: the login form already shows the generic localized 429 message, and the 429 contract does not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authentication`:
  - **Login Attempt Rate Limiting**:
    - The counter key becomes the "client key": the IPv4 address, or the /64 prefix for IPv6, with IPv4-mapped addresses normalized to IPv4.
    - "Limit isolated per IP" is restated per client key.
    - New scenarios: two IPv6 addresses in the same /64 share a counter, while different /64 prefixes do not. An IPv4-mapped address shares the counter of its IPv4 form.
    - The counters survive an application restart and are shared across instances.
  - **Client IP Resolution for Rate Limiting**:
    - `TRUST_PROXY` accepts a positive integer hop count.
    - New scenarios: an N-hop value resolves the client N hops back in the forwarded-for chain, and invalid values fail at startup.
    - The existing off and `true` scenarios are unchanged.

## Approach

The exploration recommended (b) for TD-28 and the guard override for TD-29. For TD-30 the user chose option (b), Postgres storage, over accepting the reset.

- **TD-28.** Extend `apps/api/src/shared/infrastructure/env/trust-proxy.ts` to return `false | number`. `main.ts` already passes the result to `app.set('trust proxy', ...)`, and Express interprets a number as a hop count. Strict validation with fail-fast at boot. Unit tests in `trust-proxy.spec.ts`. An e2e case for 2 hops.
- **TD-29.** Subclass `ThrottlerGuard` in the auth module and override `getTracker`. A small, pure, unit-tested function normalizes the address. It handles IPv4-mapped addresses and zone IDs, and falls back on a missing `req.ip`. Its exact fallback key is a design decision; it must not throw and must not exempt the request. The login route uses this guard instead of the plain `ThrottlerGuard`. No new library.
- **TD-30.** Add a Prisma model, for example a throttle record with key, hit count and expiry. The design phase fixes the exact shape and how `blockDuration` and `isBlocked` are represented.
  - A Prisma adapter implements `ThrottlerStorage.increment` with one atomic statement: a single upsert, or raw SQL `INSERT ... ON CONFLICT ... DO UPDATE` that resets the window when the row has expired.
  - The adapter is wired into `ThrottlerModule.forRootAsync` storage.
  - Cleanup is opportunistic: expired rows are overwritten in place, and a bounded delete of expired rows can run during increments. Design may refine this. No cron or long-lived timer.
  - Integration tests run against the hermetic per-run DB and cover concurrency (N parallel increments give a count of N) and window expiry.
  - The adapter follows the hexagonal port/adapter pattern already used for Prisma repositories.
- **Testing and delivery.** Strict TDD (ADR-016) applies. The e2e suites keep their raised limits through `e2e-env.setup.ts`. Persisted counters must not leak between suites or test cases; design decides between key isolation and truncation.

### PR slicing hint (final in `sdd-tasks`)

1. **PR 1: TD-28 and TD-29.** Hop-count parsing, the `/64` tracker guard, unit and e2e tests, the README topology table and the spec-facing docs. About 160 to 240 lines, mostly tests.
2. **PR 2: TD-30.** Prisma model and migration, storage adapter, wiring, and integration and e2e tests. About 300 to 450 lines; it may exceed 400 lines because of test fixtures, which is acceptable under the size-exception rule when the excess is tests.
3. **PR 3: archive.** Delta merged into `openspec/specs/authentication/spec.md`, the ADR-011 addendum (if not already in the PRs above), and the TD register moves (TD-28, TD-29 and TD-30 to Resolved; TD-31 stays open).

## Affected Areas

| Area                                                                                              | Impact           | Description                                         |
| ------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------- |
| `apps/api/src/shared/infrastructure/env/trust-proxy.ts` (+ spec)                                  | Modified         | Hop-count parsing and validation                    |
| `apps/api/src/main.ts`                                                                            | Modified (maybe) | Only if the return type requires it                 |
| `apps/api/src/modules/auth/presentation/` (new guard) and `auth.controller.ts`                    | New/Modified     | `/64` tracker guard on the login route              |
| `apps/api/src/modules/auth/auth.module.ts`                                                        | Modified         | Guard provider, Postgres storage wiring             |
| `apps/api/src/modules/auth/infrastructure/` (throttle storage adapter)                            | New              | Prisma `ThrottlerStorage`                           |
| `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`                                    | New/Modified     | Throttle record model and migration                 |
| `apps/api/test/login-rate-limit.e2e-spec.ts`, `apps/api/test/e2e-env.setup.ts`, integration tests | Modified/New     | Hop count, IPv6, persistence and concurrency cases  |
| `openspec/specs/authentication/spec.md` (via delta)                                               | Modified         | Rate-limiting and client-IP requirements            |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`, `README.md`                           | Modified         | Addendum, topology table, env docs                  |
| `docs/technical-debt.md`                                                                          | Modified         | TD-28, TD-29 and TD-30 to Resolved; TD-31 unchanged |

## Risks

| Risk                                                                                                                 | Likelihood | Mitigation                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| The production topology is unknown, so an operator may set the wrong hop count: one shared bucket, or spoofable keys | Med        | No default other than off; topology table in README and ADR; strict boot validation. The value stays an explicit deployment decision. |
| If Vercel or another serverless/shared platform is chosen, ADR-001 (one VPS per company) needs revisiting            | Med        | Out of scope; recorded as an open question in the ADR-011 addendum.                                                                   |
| PaaS forwarding behavior (hop count, header used) is platform-specific and not verified here                         | Med        | The PaaS table row tells the operator to confirm the platform's documented hops before setting the value.                             |
| An extra DB write per login attempt adds latency and load, and the DB becomes a dependency of the throttle           | Low        | Login already requires the DB; one indexed upsert per attempt is minor at this scale.                                                 |
| A non-atomic increment loses hits under concurrency                                                                  | Med        | A single-statement upsert, plus an integration test with parallel increments.                                                         |
| Throttle rows grow without bound                                                                                     | Low        | Expired rows are reused in place, plus bounded opportunistic deletion; covered by a test.                                             |
| Persisted counters leak across e2e suites or test cases and cause flaky 429s                                         | Med        | Design defines key isolation or table cleanup; `e2e-env.setup.ts` keeps high limits.                                                  |
| Clients sharing a /64 (same household or office network) share a bucket                                              | Low        | Standard practice; 10 attempts per 15 minutes is generous.                                                                            |
| Throttle keys contain client IPs (personal data) at rest                                                             | Low        | Design confirms whether `@nestjs/throttler` already hashes the key. If not, the adapter stores a hash.                                |
| A distributed attack on one account remains possible (TD-31)                                                         | Med        | Explicitly deferred; TD-31 stays open in the register.                                                                                |

## Rollback Plan

- **PR 1** (TD-28 and TD-29): revert the PR. No data or schema change. `TRUST_PROXY=true` and unset keep their meaning, but a numeric value would then fail at boot, so reset it to `true` or unset before deploying the revert.
- **PR 2** (TD-30): revert the PR so the module falls back to the default in-memory storage. The migration only adds a table. Leave it in place, which is harmless, or drop it with a follow-up down migration. No existing data is touched. Counters reset once on rollback, which is the current behavior anyway.
- Each PR reverts independently. PR 2 does not depend on PR 1's code paths, beyond storing whatever key the tracker produces.

## Dependencies

- `@nestjs/throttler` 6.4.0 (already pinned); its `ThrottlerStorage` interface.
- Prisma and the hermetic integration-test DB (`hermetic-integration-tests`).
- Each PR must pass the `ci` check (ADR-017).

## Success Criteria

- [ ] `TRUST_PROXY` accepts off, `true` and positive integers. `0`, negatives, decimals and garbage abort boot (unit tests).
- [ ] E2E: with `TRUST_PROXY=2`, the client is resolved two hops back in `X-Forwarded-For`, and clients behind the same two proxies get separate counters.
- [ ] Two IPv6 addresses in the same /64 share one counter, while different /64 prefixes do not. `::ffff:a.b.c.d` shares the counter of `a.b.c.d`. A missing `req.ip` neither throws nor bypasses the limit.
- [ ] Counters survive an application restart: a new app instance on the same DB still returns 429 within the window.
- [ ] Two app instances on one DB share the limit, so the combined attempts exceed it.
- [ ] Concurrent increments are not lost (integration test).
- [ ] Expired rows are reset or removed (integration test).
- [ ] The README and the ADR-011 addendum contain the topology-to-value table and record the ADR-001 or serverless open question.
- [ ] `openspec/specs/authentication/spec.md` reflects the new behavior after archive. TD-28, TD-29 and TD-30 are in Resolved with PR numbers, and TD-31 remains open.

## Open Questions

- Production topology and platform (VPS vs. serverless such as Vercel). This decides the deployed `TRUST_PROXY` value and, for serverless, whether ADR-001 must be revisited. It is not blocking for this change.
- TD-31, per-email keying and account lockout: a future slice.
