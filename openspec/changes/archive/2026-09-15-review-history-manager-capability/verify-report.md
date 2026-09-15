# Verification Report: review-history-manager-capability

FR-008's fifth and final role-based visibility scope — a `MANAGER` holding `VIEW_ALL_REVIEWS` reads every completed session installation-wide.

**Verified against**: `main` @ `a78c615` (PR 4/4, #119). Working tree clean.
**Chain**: PR1 #116 `a5ae336` · PR2 #117 `8b6769b` · PR3 #118 `155f58a` · PR4 #119 `a78c615`
**Mode**: Strict TDD · **Artifact store**: hybrid · **Date**: 2026-09-15

## VERDICT: PASS WITH WARNINGS — 0 CRITICAL · 5 WARNING · 4 SUGGESTION

Nothing blocks `sdd-archive`. Every requirement of all six delta specs is implemented and, except where itemised below, covered by a test that passed at runtime in this run.

## Completeness
53/53 task items checked (PR1 10 · PR2 12 · PR3 19+1 sub-bullet · PR4 11). Two checkoffs over-claim coverage: 3.18's sub-bullet (W1) and 4.7 (S2).

## Gates executed
| Gate | Result |
|---|---|
| API unit `npm run test --workspace=apps/api` | PASS — 110 suites / 877 tests, 30.1s |
| API integration (real Postgres) `npm run test:integration` | PASS — 22 suites / 132 tests, 7.6s |
| API e2e `npm run test:e2e --workspace=apps/api` | PASS — 10 suites / 332 tests, 23.5s |
| Web `npm run test --workspace=apps/web` (vitest) | PASS — 47 files / 705 tests, 73.1s |
| Web `npm run build` (`tsc -b` + vite) | PASS — clean |
| API `npx tsc --noEmit` | 2 errors, BOTH pre-existing on `main`, in files untouched by this change: `record-entry.use-case.spec.ts:276`, `prisma-review-session.repository.integration.spec.ts:810` (see S4) |
| `npm run lint` | PASS — 0 errors; 4 pre-existing warnings in `auth.controller.spec.ts` (untouched) |

## Spec compliance
- `review-history` — COMPLIANT except the granted-manager empty-installation scenario (W1)
- `authorization` — COMPLIANT except the grant/revoke no-re-login pair (W3)
- `user-management` — COMPLIANT except the concurrency scenario (W2/M3)
- `user-admin-ui` — COMPLIANT except the unsaved-round-trip toggle scenario (S1)
- `review-history-ui` — COMPLIANT
- `review-session-management` — COMPLIANT

Key runtime evidence: granted manager list+by-id `review-history.e2e-spec.ts:1051`; granted list identical to admin's, pinned to named fixture rows `:2268`; ungranted `200 []`/indistinguishable `404`, never 403 `:1028`; ungranted reaches no repository call (six spies `not.toHaveBeenCalled()`) `review-history-access.service.spec.ts:194`/`:507`; soft-deleted granted manager on the SAME cookie sees nothing `:1087`; checker table-driven 5 roles × {none, granted, soft-deleted} + stale-JWT-role guard + out-of-union backstop + `findById` asserted on every invocation `user-manager-capability.checker.spec.ts`; write path grant/revoke/no-op/clear/reject `users.e2e-spec.ts:881,939,970,1008,1045,1076`; web toggle render/prefill/omit/submit `UserEditPage.test.tsx:280-355`.

## Design coherence
All seven decisions implemented as written: enum+`@default([])` (`schema.prisma:65-67`); boolean checker with persisted-role re-check (`user-manager-capability.checker.ts:30-58`); MANAGER branch reusing the admin read, port comment updated to "exactly two branches" (`review-session.repository.port.ts:146-153`), production call sites still port + 2 adapters + 1 service; `MANAGER: ['reviewSession:read']` (`role-permission.checker.ts:56`) with the two-GET-route widening pinned at `review-history.e2e-spec.ts:1169`; policy + `SERIALIZABLE` transaction (`update-user.use-case.ts:107-198`, `prisma-user.repository.ts:187-196`); PATCH semantics + non-empty-only refinement + dual-violation precedence test; role-only route gate (`App.tsx:346-370`, `HealthPage.tsx:33`).

Recorded deviation (accepted, correct): tasks 2.11 shipped ungranted-MANAGER as `200 []`/`404` instead of the design table's `403`, because no 403 is reachable once `reviewSession:read` is unconditional. Reasoning recorded in-place at `review-history.e2e-spec.ts:1020-1027`.

## Explicit verdict on the recorded Known gaps
**M3 (concurrency) — STILL OPEN (WARNING).** No test anywhere fires racing PATCHes; searched for `concurrent`/`Promise.all`/`40001`/`TransactionConflict` — only a prose comment. Mechanism sound by inspection (tx opened `update-user.use-case.ts:107`, `existing` re-read inside `:112`, both policy calls fed from it `:148`/`:163`, `Serializable` `prisma-user.repository.ts:189`, P2034→`TransactionConflictError` `:196`), but the spec says the bad row-state "MUST be unreachable, not merely unlikely" and nothing proves it. tasks.md's assessment is accurate.

**M4 (granted-manager empty installation) — STILL OPEN (WARNING), NOT resolved by `b05a2e8`.** That commit fixed a different problem (M2's vacuous `toEqual`), adding four `toContain`/`not.toContain` assertions at `review-history.e2e-spec.ts:2282-2294` and nothing else. The empty-installation scenario for a granted MANAGER remains uncovered — the suite's only empty-installation e2e is `:546` (a MAINTENANCE_TECHNICIAN). 3.18's sub-bullet is 2/3 closed. Residual risk very low: identical repository method as the admin, and `:1028` already proves the MANAGER role serialises `200 []` through the same use case. Note the admin's identically-worded scenario is also uncovered — pre-existing, inherited from the archived admin-scope slice.

## Task 4.11 invariants re-verified
Enum exactly one member: PASS. No other ADR-011 name in `apps/**`/`packages/**`: LITERALLY FALSE (W4). No `managerCapabilities` in JWT/token/`/auth/me`: PASS (zero matches in `apps/api/src/modules/auth/**`, `apps/web/src/auth/**`). No client-side authorization decision derived from it: PASS. Exactly one unscoped read with two call sites: PASS.

## WARNINGS
**W1 — M4 untested**: `specs/review-history/spec.md` "An empty installation renders a successful empty list" (granted MANAGER) has no covering test. Fix: one e2e in a fresh `buildApp` with a seeded granted MANAGER and no sessions.

**W2 — M3 untested**: `specs/user-management/spec.md` "Two concurrent writes cannot leave a non-MANAGER row holding a capability". Fix: integration test with `Promise.allSettled`, assert one resolves / one `409 TRANSACTION_CONFLICT`, and the final row never holds non-MANAGER + non-empty capabilities.

**W3 — NEW, not in Known gaps**: no e2e composes a live grant/revoke PATCH with a subsequent `/review-history` request on the same session. `review-history.e2e-spec.ts` seeds granted managers via `buildSeedUser` and never PATCHes; `users.e2e-spec.ts:881` PATCHes but asserts only `/users` responses. So `authorization/spec.md`'s "A revoke/grant takes effect on the next request with no re-login" and `review-history/spec.md`'s "A revoked manager reads nothing from the next request" + "A role round trip leaves no capability behind" are proven only by composition. The design's Testing Strategy named this exact e2e row. Mitigation: `:1087` (soft-deleted granted manager, same cookie → `[]`/404) does prove per-request resolution end-to-end. This is the behaviour browser-verified manually on 2026-09-15; the suite does not encode it. Fix: extend the granted-manager e2e with an admin revoke, then repeat list (`[]`) and by-id (`404`) on the same agent — closes four spec scenarios at once.

**W4 — invariant literally violated and structurally unguarded**: `packages/validation/src/users/update-user.schema.spec.ts:25` uses `['MANAGE_COMMUNITIES']` as the unknown-member rejection fixture. The only automated guard (`review-history.e2e-spec.ts:2456-2552`) walks `apps/api/src` only — not `packages/**`, not `apps/web/**` — and never searches the other five names. Fix: rename the fixture to e.g. `'NOT_A_CAPABILITY'`, or narrow the spec wording.

**W5 — ADR-011 Decision 3's superseded sentence carries no inline pointer**: `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md:73-75` still says `PermissionChecker` resolves "plus the `managerCapabilities` flags above". The 2026-09-15 addendum (item 2) supersedes it accurately and explicitly, but Decision 3 is unmarked — while Decision 1 at line 45 does use this file's own "see the addendum below" convention. A reader landing there gets text contradicting `specs/authorization/spec.md`'s binding "`can()` MUST NOT perform a database read" — the exact disagreement the proposal wanted closed. Fix: one parenthetical cross-reference.

## SUGGESTIONS
**S1** — `specs/user-admin-ui/spec.md` "A role round trip within one unsaved session resets the toggle" has no web test; `UserEditPage.test.tsx:302` covers only the change-away half. The silent-revoke consequence is accepted by design, which is why it deserves pinning.
**S2** — tasks 4.7's "and its tests remain unmodified" over-claims: `UserCreatePage.test.tsx` gained 3 fixture lines in PR4. Page and assertions genuinely untouched.
**S3** — Engram `apply-progress` (#255) had been upserted down to a two-paragraph merge summary that briefly mis-described M4 as resolved after PR3's review round — corrected in a follow-up save before archive (see topic `sdd/review-history-manager-capability/apply-progress`). Not treated as CRITICAL because tasks.md carries the per-item `(TDD)` markers, every named test file exists, and all suites are green.
**S4** — `apps/api` `tsc --noEmit` is red on `main` for two pre-existing reasons; while it stays red the manual type-check gate cannot fail loudly on a real regression. Worth a standalone cleanup change.

## ADR-011 addendum assessment
Accurate, non-contradictory, correctly scoped: one declared member; explicit supersession of Decision 3 with the actual Layer-2 port shape; the boolean-return/truthiness rationale; MANAGER's single permission plus the named two-GET-route consequence; fresh-per-request DB read; edit-only granting with clearing stricter than `maintenanceCompanyId`; no audit trail. It neither overstates nor understates scope. Only gap: it omits the promotion-reset rule (design Decision 5) — an omission, not a contradiction, and acceptable at ADR granularity. See W5 for the one documentation defect.

## Strict TDD assessment
Test-first evidence: `(TDD)` markers in tasks.md (1.8, 1.9, 2.4, 2.6, 3.5, 3.8, 3.10); Engram evidence table overwritten (S3). All 7 named test files exist. 2046 tests green across four suites. Triangulation strong (checker 5 roles × 3 states; policy all six resolution rows; schema accept/reject/precedence). Assertion quality: no tautologies, no ghost loops, no smoke-only tests; every empty-collection assertion has a non-empty companion (`:1028`↔`:1051`, service spec `:194`↔`:229`); the one genuine vacuity risk was caught and fixed in review (`b05a2e8`).

## Next step
`sdd-archive`. No warning blocks it. Best value per line if closing any first: W3 (one e2e closes four scenarios), then W1 (one e2e), then W4 (a one-word rename).
