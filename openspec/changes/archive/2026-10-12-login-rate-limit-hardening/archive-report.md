# Archive Report: login-rate-limit-hardening

**Archived**: 2026-10-12
**Archive path**: `openspec/changes/archive/2026-10-12-login-rate-limit-hardening/`
**Artifact store**: hybrid (openspec files canonical, Engram mirror `sdd/login-rate-limit-hardening/*`)
**Branch**: `login-rate-limit-hardening/04-archive` (from main at c3f6430)

## Outcome

Hardens the login rate limit shipped by `login-rate-limit` (2026-10-07) and closes TD-28, TD-29 and TD-30:

- TD-28: `TRUST_PROXY` accepts a positive integer hop count N (plus `true` for one hop and off); any other value fails application startup. Spoofed `X-Forwarded-For` prefixes cannot choose the key.
- TD-29: the throttle key is derived from the resolved IP by `toClientKey`: IPv4 as is, IPv4-mapped IPv6 as its IPv4, any other IPv6 as its `/64` prefix, and an undeterminable IP as one shared `unresolved` key.
- TD-30: counters persist in Postgres (`ThrottleCounter`, keyed by the library's SHA-256 hash of the client key, no raw IP) through a `PrismaThrottlerStorage` adapter, so they survive restarts and are shared by all instances. The storage fails closed: a storage error refuses the attempt with a 500.

API only, no UI change (the browser gate does not apply).

## Specs Synced

| Domain         | Action  | Details                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| authentication | Updated | 2 MODIFIED requirements replaced in full: "Login Attempt Rate Limiting" (client key, `/64` grouping, IPv4-mapped handling, persistence, shared instances, concurrency; 16 scenarios) and "Client IP Resolution for Rate Limiting" (hop-count `TRUST_PROXY`, startup validation; 6 scenarios). 0 added, 0 removed. All other requirements are unchanged. |

Composition ran through the native command (zero exit), on LF copies of both files, and the result was converted back to CRLF to match the main spec's line endings:

```
gentle-ai sdd-archive-compose --canonical <canonical.md> --delta <delta.md> --output <out.md>
```

`git diff -U0 openspec/specs/authentication/spec.md` shows hunks only between the original lines 176 and 241, i.e. inside the two modified requirements; the rest of the file is byte-identical to HEAD. The delta's "(Previously: ...)" notes were carried into the main spec, as in the `login-rate-limit` archive.

## Delivery (final state)

| PR               | Content                                                                                                              | Merge   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------- |
| #206 (PR 1/4)    | TD-28 hop-count `TRUST_PROXY` + TD-29 `toClientKey` / `LoginThrottlerGuard`, README topology table, ADR-011 addendum | d7c3379 |
| #207 (PR 2/4)    | Postgres storage: `ThrottleCounter` migration and `PrismaThrottlerStorage` adapter                                   | a79d3a8 |
| #208 (PR 3/4)    | Wiring (`ThrottlerModule.forRootAsync`), e2e storage overrides, integration spec, docs                               | c3f6430 |
| PR 4/4 (archive) | This change; number not known at writing time                                                                        | pending |

PR 3 size was about 340 lines (+307/-33): code ~16, tests ~220, docs ~72. The earlier "~244" note in `tasks.md` (C.7) was corrected at archive.

## Tasks

Per the persisted `tasks.md` at archive time: Phases A, B and C and gates G.1-G.3 are checked; D.1-D.5 are checked by this archive PR; **D.6 (fresh-context review of the archive PR, user-confirmed push and merge) is unchecked and is performed after this report**. Unfinished tasks: D.6 only.

- D.1: evidence is `verify-report.md` (PASS).
- D.2: spec merge and folder move, above.
- D.3 / D.4: register changes, below.
- D.5: README and ADR-011 addendum were checked and found complete (fixed-window note, topology table, persisted counters, deployment topology and ADR-001/serverless as open questions); no change was needed.

## Verification (final state)

Per `verify-report` (Engram #548, written 2026-10-12 after the PR 3 merge): PASS, 0 CRITICAL, 0 WARNING, 3 SUGGESTION. At verify time: lint exit 0 (0 errors, 4 pre-existing warnings), build exit 0, unit 143 suites / 1425 tests, integration 31 suites / 224 tests, e2e 12 suites / 470 tests, all passing. All 22 spec scenarios (16 + 6) are covered. Strict TDD evidence was reported per phase (recorded in `apply-progress`, Engram #534).

Suggestions at verify time and their final state:

- S-1 (no app-level window-elapsed test over Postgres): open, recorded as EN-10.
- S-2 (6+5 scenario scaled to 2+1 in the integration spec): no action needed.
- S-3 (design Decision 7 said the adapter is `@Injectable()`-free): resolved at archive; the wording in the archived `design.md` now says the adapter carries `@Injectable()` but is constructed manually in `forRootAsync`.

The "Invalid TRUST_PROXY rejected at startup" scenario is proven at unit level only (`trust-proxy.spec.ts`; `main.ts` calls it before `listen`), accepted in the design.

## Register Changes

`docs/technical-debt.md`:

- Moved to Resolved: TD-28 and TD-29 (`login-rate-limit-hardening`, #206); TD-30 (`login-rate-limit-hardening`, #207 and #208).
- TD-31 (account lockout, per-email keying) stays open; annotated as deferred to its own slice (decided 2026-10-12).
- Added TD-35 (Medium): every login attempt does a Postgres upsert on the shared Prisma pool, and the cleanup is awaited on the request path with no `statement_timeout` and an index only on `windowEndsAt`. Origin: PR 2 and PR 3 RDD reviews.

`docs/enhancements.md` (all with origin `login-rate-limit-hardening`, 2026-10-12): EN-5 was added earlier by PR 1; this archive adds EN-6 (HMAC-keyed throttle key hashing), EN-7 (client-key and guard test gaps), EN-8 (README note on an oversized `TRUST_PROXY`), EN-9 (adapter SQL readability), EN-10 (adapter and integration test gaps), EN-11 (test-harness cleanup), EN-12 (map storage failures to 503 with `Retry-After`), EN-13 (boot-level test that an invalid `TRUST_PROXY` stops the app).

## Deferred Items and Open Questions

- TD-31: account lockout and per-email keying, deferred to its own slice.
- Production deployment topology (which `TRUST_PROXY` value production needs): still an open question in the ADR-011 2026-10-12 addendum; nothing assumes one.
- ADR-001 and serverless: ADR-001 describes a single long-running instance. Counters no longer depend on that, but a serverless target would change pooling and the cost of the per-attempt write; to be revisited if the deployment target changes.
- TD-35 and EN-5 to EN-13, as above.

## Archive Contents

- explore.md: present
- proposal.md: present
- specs/authentication/spec.md: present
- design.md: present (Decision 7 wording corrected at archive)
- tasks.md: present; C.7 size note corrected and D.1-D.5 checked at archive; D.6 unchecked
- verify-report.md: present
- apply-progress: not a file in this change (Engram only, #534)
- archive-report.md: this file

## Archive Readback

The change folder was moved with `git mv` after a recursive snapshot was taken, and `diff -r <snapshot> <archive folder>` produced empty output (exit 0). The edits to `tasks.md` and `design.md` listed above were made before the snapshot, so they are part of the archived bytes.

## Engram Observation IDs (traceability)

- explore: #525
- proposal: #530
- spec: #531
- design: #532
- tasks: #533
- apply-progress: #534
- verify-report: #548
- archive-report: `sdd/login-rate-limit-hardening/archive-report` (saved by this phase)
