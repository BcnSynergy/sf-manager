# Verify Report: login-rate-limit-hardening

Date: 2026-10-12. Branch: `login-rate-limit-hardening/04-archive` (from main at c3f6430). Mode: Strict TDD, artifact store hybrid.

## Verdict

PASS. 0 CRITICAL, 0 WARNING, 3 SUGGESTION.

## Commands Run

| Check       | Command                                         | Result                                                                                                         |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Lint        | `npm run lint --workspace=apps/api`             | exit 0, 0 errors, 4 pre-existing warnings (`auth.controller.spec.ts` no-unsafe-argument, not from this change) |
| Build       | `npm run build --workspace=apps/api`            | exit 0                                                                                                         |
| Unit        | `npm run test --workspace=apps/api`             | 143 suites, 1425 tests passed                                                                                  |
| Integration | `npm run test:integration --workspace=apps/api` | 31 suites, 224 tests passed                                                                                    |
| E2E         | `npm run test:e2e --workspace=apps/api`         | 12 suites, 470 tests passed                                                                                    |

The e2e run printed a stack trace from a `ListReviewScheduleUseCase` path, but the suite passed. The integration run logged the intentional "simulated storage outage" error from the fail-closed test. Coverage tooling was not run. No browser check: there is no UI change.

## Task Completeness

- Phases A (A.1-A.13), B (B.1-B.6) and C (C.1-C.7, including C.3.1-C.3.13) are all done.
- Gates G.1, G.2 and G.3 are done.
- Phase D (D.1-D.6) was pending at verify time, as expected.

## Spec Scenario Coverage

Paths are relative to `apps/api`. E2E = `test/login-rate-limit.e2e-spec.ts`, INT = `test/login-rate-limit.integration.spec.ts`, ADP = `src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.integration.spec.ts`.

### Requirement: Login Attempt Rate Limiting

| Scenario                                 | Covering test                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Attempt over the limit                   | E2E:139 (11th gets 429 with a numeric `Retry-After`); ADP:59                                         |
| Successful attempts count                | E2E:139 (10 successful logins, then 429)                                                             |
| Limit isolated per client key            | E2E:189; INT:93 (other client gets 401 after A is exhausted)                                         |
| Other endpoints unaffected               | E2E:139 (`/health` and `/auth/me` return 200 after exhaustion)                                       |
| Default limits                           | E2E:139 (10 pass, 11th gets 429 with env unset)                                                      |
| Configured limits                        | E2E:170 (2 attempts per 1 s via env; 3rd gets 429, `Retry-After: 1`)                                 |
| Window elapsed                           | E2E:170 (recovers after 1.5 s); ADP:98 and ADP:111 (Postgres window and block expiry)                |
| IPv6 same /64 shares a counter           | E2E:231                                                                                              |
| Rotating the low 64 bits does not reset  | E2E:231 (third attempt with rotated low bits gets 429)                                               |
| Different /64 prefixes isolated          | E2E:231; `client-key.spec.ts:29`                                                                     |
| IPv4 clients unchanged                   | E2E:189; `client-key.spec.ts:8`                                                                      |
| IPv4-mapped IPv6 shares the IPv4 counter | E2E:245; `client-key.spec.ts` (mapped forms)                                                         |
| Counters survive an API restart          | INT:93 (app A exhausted and closed, app B gets 429 with `Retry-After`)                               |
| Counters shared across instances         | INT:113 (2+1 split against a limit of 3; same semantics as the spec's 6+5 against 10)                |
| Concurrent attempts are all counted      | INT:126; ADP:129 (50 concurrent give exactly {1..50}); ADP:146 (exactly `limit` of `limit + 5` pass) |
| Client IP cannot be determined           | `login-throttler.guard.spec.ts:35`, `:56`, `:71`; `client-key.spec.ts:44`                            |

### Requirement: Client IP Resolution for Rate Limiting

| Scenario                                        | Covering test                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| TRUST_PROXY off                                 | E2E:139 (varying `X-Forwarded-For`, one socket counter)                                       |
| TRUST_PROXY on (`true`)                         | E2E:189                                                                                       |
| TRUST_PROXY with a hop count                    | E2E:204 (`TRUST_PROXY=2`)                                                                     |
| Hop count ignores client-supplied extra entries | E2E:217 (spoofed prefix, same counter)                                                        |
| TRUST_PROXY empty or false                      | `trust-proxy.spec.ts:4`                                                                       |
| Invalid value rejected at startup               | `trust-proxy.spec.ts:17-37` (12 rejected values throw naming `TRUST_PROXY` and the raw value) |

Limitation: the last scenario is proven at unit level. `main.ts:19` calls `getTrustProxySetting` before `listen`, and the design accepts unit-level proof because e2e does not exercise `main.ts`.

Also covered beyond the spec: fail closed with a 500 when storage fails (INT:140); no raw client address stored, keys are sha256 hex (INT:153, ADP:238); bounded cleanup that keeps live rows (ADP:160, ADP:218); ttl and block durations above 2^31-1 ms (ADP:205).

## Strict TDD Compliance

| Check                     | Result                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| TDD evidence reported     | Found: apply-progress has a TDD Cycle Evidence table for Phases A, B and C                    |
| Tests exist for all tasks | Yes. B.1 (migration) and C.1 (config) are n/a with a stated reason; docs tasks are TDD-exempt |
| GREEN confirmed           | Yes, all cited suites pass on re-execution                                                    |
| Triangulation             | Adequate (`it.each` tables with passing and rejecting cases)                                  |
| RED evidence              | Recorded per row with the observed failure; accepted as reported                              |

C.3 records that 11 e2e suites would have passed without the storage override only by accident, because of the `PrismaService` mock row shape. No tautologies, ghost loops or smoke-only tests found.

## Design vs Code Consistency

Consistent. `trust-proxy.ts` returns `false | number`; `client-key.ts` and `LoginThrottlerGuard` have the specified shape; `auth.controller.ts:54` uses `@UseGuards(LoginThrottlerGuard)`; `auth.module.ts` uses `forRootAsync({ inject: [PrismaService], ... })` with `PrismaThrottlerStorage`; the adapter SQL matches Decision 5 (bigint casts, `date_trunc`, `RETURNING`); cleanup matches Decision 6. The only deviation is S-3.

## Findings

### CRITICAL

None.

### WARNING

None.

### SUGGESTION

- **S-1**: Postgres-backed block and window-elapsed semantics are proven at adapter level (ADP:59-111). No app-level test over real Postgres crosses a window boundary; the e2e "Window elapsed" test uses the in-memory store.
- **S-2**: The "Counters shared across instances" scenario uses 6+5 against 10; INT:113 uses 2+1 against 3. Same behavior, scaled for speed. No action needed.
- **S-3**: Design Decision 7 describes the adapter as `@Injectable()`-free, but `prisma-throttler-storage.adapter.ts:30` carries `@Injectable()`. Harmless, since the class is constructed manually.

## Known Non-Blocking Items

Already recorded from the PR 1-3 reviews and handled in the archive PR registers: see `archive-report.md`.
