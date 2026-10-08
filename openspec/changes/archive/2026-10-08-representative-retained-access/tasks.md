# Tasks: Representative keeps access to their own performed sessions

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1 ~380-430 (code ~45, tests ~320, docs ~35); PR 2 archive/docs only |
| 400-line budget risk | Medium (PR 1 only; any excess is tests) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (API + tests + docs) then PR 2 (archive) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

Decision needed: PR 1 may pass 400 lines at the upper estimate. Code is ~45 lines; the excess is tests (CLAUDE.md size-exception rule). Coverage is never trimmed.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Service union (list, by-id, element) + tests + e2e reversal + ADR-011/FR-010 docs | PR 1/2 | Base: main. Branch `representative-retained-access/01-retained-own-sessions`. Title `feat(review-history): PR 1/2 — representative keeps own performed sessions` |
| 2 | Verify report, archive, delta merge, D8 hand edits | PR 2/2 | Base: main (after PR 1 merges). Branch `representative-retained-access/02-archive`. Title `docs(openspec): PR 2/2 — archive representative-retained-access` |

Strict TDD: RED, GREEN, REFACTOR per unit; apply records a "TDD Cycle Evidence" table. One commit per work unit (tests with code). Paths under `apps/api/`. Unit: `npm run test --workspace=apps/api`; e2e: `npm run test:e2e --workspace=apps/api`. No port, adapter, schema or integration-test change (D1, D6).

## Phase A: PR 1 (sdd-apply)

Unit A, list union (D2; "An own session outside the assigned communities is listed", "A session both assigned and own appears once", "Another community's sessions never appear")
- [x] A.1 RED: `src/modules/review-session/application/services/review-history-access.service.spec.ts`: rewrite `:179-189` (no assignment: `findCompletedForPerformer` called, `findCompletedInCommunities` not, other performer's session absent); add union, dedupe by id, `completedAt` DESC then `id` DESC, and the cross-source equal-`completedAt` tie (own session outside assigned communities vs another performer's community session).
- [x] A.2 GREEN: `review-history-access.service.ts` `listForActor` representative branch + private `completedHistoryOrder` (`?.getTime() ?? 0`, no `!`); guard empty scope.
- [x] A.3 REFACTOR: tidy, comments.

Unit B, by-id (D3; "A deactivated representative keeps their own completed session", "...gains nothing beyond their own work")
- [x] B.1 RED: same spec: own hit resolves and `listAssignedCommunityIds` NOT called; own session without assignment resolves; another performer's session without assignment gives `ReviewSessionNotFoundError`; community-session (own miss) resolves via `findCompletedByIdInCommunities`.
- [x] B.2 GREEN: `loadByRole` representative branch: `findCompletedByIdForPerformer` first, lazy `communityIds`, empty gives `null` (single throw site).
- [x] B.3 REFACTOR.

Unit C, element history (D4; "A deactivated representative sees only their own entries", "A deactivated representative who recorded an entry reaches the element")
- [x] C.1 RED: same spec: unassigned with own entries gives reachable, own entries only; unassigned without own entries gives `{reachable:false}`; assigned case unchanged (empty is reachable).
- [x] C.2 GREEN: `listElementHistoryForActor`: `communityIds.includes(element.communityId)` keeps the branch; else `findCompletedEntriesForElementForPerformer`, empty gives not reachable.
- [x] C.3 REFACTOR; run the unit suite.

Unit D, e2e (document, write surface; "A document read by an unassigned representative is limited to their own sessions", "A deactivated representative's write surface stays closed")
- [x] D.1 RED: `test/review-history.e2e-spec.ts`: reverse `:3845-3908` to 200 on the rep's own document, keeping the negative: same deactivated rep gets `404 REVIEW_SESSION_NOT_FOUND` on a technician's document on that community.
- [x] D.2 RED: add in the `:1389` block: list holds own, not the technician's; by-id 200 own / 404 technician's; element history 200 with only own entries, `404 INSPECTABLE_ELEMENT_NOT_FOUND` where none; write to X refused.
- [x] D.3 GREEN: run `npm run test:e2e --workspace=apps/api`; confirm `:1575`, `:3067`, `:3799` unchanged and green.
- [x] D.4 REFACTOR: `npx tsc -b`, lint, full unit suite; run the integration suite only as a cheap regression check.

Docs (TDD N/A; D7)
- [x] D.5 `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`: 2026-10-08 addendum (read scope = active communities ∪ own completed; writes still need an active assignment; cites D1).
- [x] D.6 `docs/requirements/functional-requirements.md:47` FR-010: deferred note for the field-flow session-page document link.
- [x] D.7 `git diff --stat`; report code vs test split; commit by work unit (list, by-id, element, e2e, docs).

## Gates (orchestrator)

- [x] G.1 Browser verification (API-only change; user pass). With the user's explicit OK, deactivate `rep@sf-manager.example`'s assignment in the dev DB (the rep may first need a completed session they performed). As the rep (user logs in): history list shows only own sessions; detail, document and element-history link render; a seeded technician session URL shows not-found. Restore the assignment. Report browser- or test-verified.
  - Browser-verified 2026-10-08 (Chrome, dev DB, logged in as `rep@sf-manager.example`). No code changes needed.
  - Setup (user OK): completed the rep's seeded draft session `…e44a` in Dev Seed Residences North through the app. This leaves one extra completed QA session in the dev DB.
  - Assignment active: history lists 3 North sessions (own plus two by `technician@`), newest first.
  - Assignment deactivated (`CommunityRepresentative` `…8663`, `deactivatedAt = now()`): history lists only the own session. Own detail and own document render. The technician's North session detail shows not-found, its document shows not-available, and a South session shows not-found. Both element-history links from the own detail render and list only the rep's own entries (technicians' entries on the same element are excluded). A South element the rep never reviewed shows not-found.
  - Assignment restored (`deactivatedAt = NULL`); history lists 3 sessions again. No console errors.
- [x] G.2 Fresh-context PR review before push and before merge; the user confirms push, PR and merge.

## Phase B: PR 2 Close

- [x] B.1 `sdd-verify` against spec scenarios after PR 1 merges; write the verify report.
- [x] B.2 `sdd-archive` via `representative-retained-access/02-archive`: merge the three deltas (review-history, authorization, review-document) into `openspec/specs/`; orchestrator does `git mv` and commit.
- [x] B.3 D8(a) hand edit: `openspec/specs/review-history/spec.md` Purpose L10-11 gains "plus the sessions they performed themselves, with or without an assignment".
- [x] B.4 D8(b) hand edit: `openspec/specs/authorization/spec.md` Purpose L15 gains the same addition.
- [x] B.5 Confirm no edit needed at review-history L464-465, L490-491 and authorization ~L611, ~L969, L1424, L1446 (D8), and that L931-935 is carried by the MODIFIED delta.
