# Tasks: Minimal Web UI for the `community` Domain

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1700-2000 (1 API file+e2e; 1 typed API client (12 calls) + error-mapping module; 1 new shared component (`AssignmentSection`, no precedent); 1 hook; 2 enum label-map modules; 4 pages incl. the 3-request `CommunityDetailPage`; 4 routes; 3-locale i18n across 8 key groups) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR8 (see Suggested Work Units); each unit targets ≤350 changed lines |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Foundation reuse (`apiFetch`/`ApiError`, `ProtectedRoute allowedRoles`,
`NotAuthorized`, `ConfirmDialog`) needs **zero** new PRs, unlike
`users-minimal-ui`'s PR2-4 — but `AssignmentSection` (no precedent), a 12-call
API client (vs 4), a 3-request detail page, and two enum label-map modules add
scope back. Net estimate is comparable to or above `users-minimal-ui`'s
~1400-1500 lines / 9 PRs, despite one fewer PR, matching the proposal's own
risk register: "Reviewer overload — 4 pages, 12 API calls, 1 API change in
one PR" (High likelihood).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | API: additive `code` on assignment 409s + e2e regression | PR 1 | No change to existing fields; unblocks web error-mapping |
| 2 | Web: `api/community.ts` (12 typed calls) + `community/error-messages.ts` | PR 2 | Depends on PR 1 (mirrors `CommunityErrorCode`); combines what `users-minimal-ui` split across PR2+PR5 since there's no separate foundation PR to sequence against |
| 3 | Web: `AssignmentSection.tsx` (Decision 3) + `assignment-status-labels.ts` | PR 3 | Depends on PR 2 (`AssignmentOps`/`Assignment` types). New foundation piece, no `users-minimal-ui` precedent — treated like that chain's `ConfirmDialog` PR |
| 4 | `CommunitiesListPage.tsx` + `locale-labels.ts` + `/communities` route | PR 4 | Depends on PR 2. Reuses `ConfirmDialog` unmodified for soft-delete |
| 5 | `CommunityCreatePage.tsx` + `/communities/new` route + list-page entry link | PR 5 | Depends on PR 2, PR 4 (locale `<select>` labels, entry point) |
| 6 | `use-community.ts` hook (Decision 4) + `CommunityEditPage.tsx` + `/communities/:id/edit` + entry link | PR 6 | Depends on PR 2, PR 4. Hook's **first real consumer** is this PR — deliberately not bundled earlier as orphaned foundation code (adjusted from the loose PR4-hook grouping floated at planning time) |
| 7 | `CommunityDetailPage.tsx` (composes `AssignmentSection` × 2) + `/communities/:id` + entry link | PR 7 | Depends on PR 2, 3, 6. Most complex PR — the load-bearing exclusivity swap (design.md Data Flow) lives here |
| 8 | i18n key-set parity, static guards, full lint/test/build, browser verification, both open-question checkpoints | PR 8 | Depends on PR 1-7. Re-verifies enum-label-mapping (criterion 18) was delivered in PR 3/4/7 — does **not** repeat `users-minimal-ui`'s late PR9 fix |

## Phase 1: API — Assignment 409 Error Codes (PR 1)
- [x] 1.1 mechanical: Create `apps/api/src/modules/community/presentation/community-error-code.ts` — `CommunityErrorCode` union (`ASSIGNMENT_ALREADY_EXISTS` | `INELIGIBLE_ROLE` | `TRANSACTION_CONFLICT`). Per design.md Decision 1.
- [x] 1.2 RED/GREEN `community.controller.ts` — `mapAssignmentError`/private `buildConflictException(error, code)` emits `{statusCode:409, error:'Conflict', message, code}` per domain error on `POST` assign + `reactivate` (reps/techs); `@ApiConflictResponse` documents `code`. Per design.md Decision 1; spec `community-assignments` "Assignment 409 Error Codes".
- [x] 1.3 mechanical: `community.controller.spec.ts` — each 409 cause asserts its own `code`; 404/400 bodies unchanged.
- [x] 1.4 RED/GREEN: extend `apps/api/test/community.e2e-spec.ts` — assert `body.code` per 409 cause (assign + reactivate where reachable); `statusCode`/`error`/`message` unchanged; 404/400 bodies carry no `code`. Traces spec scenarios "Already-assigned/Ineligible-role/Transaction-conflict 409 is distinguishable...", "404 and 400 responses on assignment routes are unaffected".
- [x] 1.5 **Checkpoint (design.md Open Question 1)**: confirm whether `IneligibleRoleError` is reachable on technician `reactivate` (controller maps it; use case may not throw it). If unreachable, record that the e2e assertion covers only the representative path — do not invent a scenario to force coverage.
  - **Finding**: `IneligibleRoleError` IS reachable on technician `reactivate` — `ReactivateTechnicianUseCase.execute()` calls `assertEligibleFor(user.role, 'TECHNICIAN')` after re-reading the user's CURRENT global role from `UserRepository`, unconditionally, on every reactivate call (not a controller-only defensive map). Since "Accepted eligibility drift" (community-assignments spec) only protects an ACTIVELY-assigned user's role from being re-validated, a role change made *while the assignment is deactivated* is fully unguarded and surfaces as 409 `INELIGIBLE_ROLE` on the next reactivate attempt — for both technician and representative. Covered by two new e2e tests, not invented: "Ineligible-role 409 on reactivate (tasks.md 1.5 checkpoint, design.md Open Question 1)".

## Phase 2: Web — Typed API Client + Error Mapping (PR 2)
- [x] 2.1 RED/GREEN `apps/web/src/api/community.ts` + test — 12 typed calls (`listCommunities`, `createCommunity`, `updateCommunity`, `softDeleteCommunity`, `list/add/deactivate/reactivate` × representative/technician); `Community`/`Assignment` types; mirrored `CommunityErrorCode` literal union. Depends on PR 1. Per design.md Interfaces/Contracts.
- [x] 2.2 RED/GREEN `apps/web/src/community/error-messages.ts` + test — `ApiError{status,code}` -> i18n key: `ASSIGNMENT_ALREADY_EXISTS`, `INELIGIBLE_ROLE`, `TRANSACTION_CONFLICT` map to three distinct keys; 404 -> `community.error.assignmentTargetNotFound`; 400 -> validation key; network/unknown -> `common.error.network`. Differential test: identical `.message` text across two codes still yields distinct keys; never reads `.message`. Traces spec "Cause-Specific Assignment 409 Messaging", "Generic Not-Found Handling on Assignment Actions", "No Server-Message String Coupling".

## Phase 3: Web — Shared `AssignmentSection` Component (PR 3)
- [x] 3.1 mechanical `apps/web/src/community/assignment-status-labels.ts` — `deactivatedAt` -> active/deactivated i18n key (`role-labels.ts` pattern). Per spec "Enum Value Label Mapping".
- [x] 3.2 RED/GREEN `AssignmentSection.tsx` + `AssignmentSection.test.tsx` — owns its own list/loading/error state; assign-by-`userId` form; refetch on every mutation; action buttons `disabled` while pending; deactivate behind `ConfirmDialog` (reused unmodified). Parameterized **only** by `ops`, `testIdPrefix`, `keys` — no boolean/mode prop. Component test: a mocked assign whose refetch returns the incumbent deactivated renders that row as deactivated (the swap, at component level). Per design.md Decision 3 (hard rule); Interfaces/Contracts `AssignmentSectionProps`. **Also required (PR2 review flag)**: a test asserting that on an `INELIGIBLE_ROLE` (409) assign error, the rendered message uses `keys.ineligible`-derived copy, not `community/error-messages.ts`'s generic `community.error.ineligibleRole` fallback — `error-messages.ts` intentionally returns the generic key expecting this component to override it per Interfaces/Contracts `AssignmentSectionProps.keys.ineligible`; without this test a careless implementation could silently skip the override and ship the generic message everywhere.
- [x] 3.3 **Rule checkpoint**: grep `AssignmentSection.tsx` for `isExclusive`/`mode`/`allowsMultipleActive` or any behavior-changing prop before merge — none may exist (design.md Decision 3 hard rule for `sdd-apply`/`sdd-verify`).

## Phase 4: Communities List Page (PR 4)
- [x] 4.1 mechanical `apps/web/src/community/locale-labels.ts` — `Locale` -> i18n key.
- [x] 4.2 mechanical: add `community.list.*`/`community.locale.*` keys to `en.json`/`es.json`/`ca.json`, real translations.
- [x] 4.3 RED/GREEN `CommunitiesListPage.tsx` + test — loading/empty/error states; renders `name`/`address`/`locale` via label map; soft-deleted rows never shown; delete -> `ConfirmDialog` -> `softDeleteCommunity` + refetch, no manual reload. Traces spec "List Active Communities", "Soft-Delete Community".
- [x] 4.4 mechanical: wire `/communities` route under `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`.

## Phase 5: Community Create Page (PR 5)
- [x] 5.1 mechanical: `community.create.*` i18n keys, 3 locales.
- [x] 5.2 RED/GREEN `CommunityCreatePage.tsx` + test — `createCommunitySchema`/`localeSchema` `safeParse` blocks submit before any network call; `<select>` options via `locale-labels`; success navigates to list without manual reload. Traces spec "Create Community".
- [x] 5.3 mechanical: wire `/communities/new` (verify it ranks above `/communities/:id`, per design.md route-order note).
- [x] 5.4 mechanical: add a "New community" link on `CommunitiesListPage.tsx` — close the entry-point gap in this same PR, not a later follow-up (`users-minimal-ui` PR6/PR7 precedent).

## Phase 6: Community Edit Page (PR 6)
- [x] 6.1 RED/GREEN `apps/web/src/community/use-community.ts` + test — `listCommunities()` + client-side select by `:id`; explicit not-found state when `:id` is absent. Per design.md Decision 4.
- [x] 6.2 mechanical: `community.edit.*` i18n keys, 3 locales.
- [x] 6.3 RED/GREEN `CommunityEditPage.tsx` + test — prefilled via `useCommunity`; `updateCommunitySchema` validation; not-found state renders no form. Traces spec "Edit Community".
- [x] 6.4 mechanical: wire `/communities/:id/edit` route; add a per-row "Edit" link on `CommunitiesListPage.tsx`.

## Phase 7: Community Detail Page — Assignment Lifecycles (PR 7, most complex)
- [x] 7.1 mechanical: `community.detail.*`/`community.representatives.*`/`community.technicians.*` i18n keys (titles, empty text, assign labels, confirm copy, ineligible copy per section), 3 locales.
- [x] 7.2 RED/GREEN `CommunityDetailPage.tsx` + test — 3 independent, parallel requests on mount (community via `useCommunity`; two assignment lists inside their own `AssignmentSection`); not-found guardrail renders **neither** assignment section when `:id` is absent (design.md Decision 4); composes `AssignmentSection` twice with distinct `ops`/`keys`/`testIdPrefix`. Traces spec "Community Detail View", "Representative Assignment Lifecycle" (incl. exclusivity + multi-community warning **not** surfaced), "Technician Assignment Lifecycle". **Heads-up (PR3 review)**: `ConfirmDialog`'s `<dialog>` is always mounted with a hardcoded `data-testid="confirm-dialog"` (not parameterized) — composing `AssignmentSection` twice means two `confirm-dialog` nodes coexist in the DOM. Tests must scope dialog queries (e.g. `within(container)` per section) rather than an unscoped `screen.getByTestId('confirm-dialog')`, which will throw on "found multiple elements."
  - **Resolved**: confirmed the collision is real via an explicit test asserting the unscoped query throws; all dialog assertions in `CommunityDetailPage.test.tsx` use `within(sectionContainer)` scoping. `ConfirmDialog.tsx` itself is unchanged.
- [x] 7.3 mechanical: wire `/communities/:id` route.
- [x] 7.4 mechanical: add a "View" link per row on `CommunitiesListPage.tsx`.
- [x] 7.5 Test: end-to-end through `CommunityDetailPage` (not just the isolated Phase 3 unit test) — a mocked add-representative whose refetch shows the incumbent deactivated renders the swap. Per design.md Data Flow diagram.

## Phase 8: Integration, i18n Parity, Verification (PR 8)
- [x] 8.1 mechanical: extend `locales.test.ts` key-set parity to all new `community.*` keys.
- [x] 8.2 Static guards (Testing Strategy): grep `apps/web/src` for `.message` reads on `ApiError` outside `error-messages.ts`'s own guarded shape; grep rendered cells/`<select>` labels for raw `Locale`/assignment-status values — none may appear outside `<option value>`/payloads.
- [x] 8.3 mechanical: run `npm run test --workspace=apps/web`, `npm run test --workspace=apps/api`, `npm run lint --workspace=apps/web`, `npm run build`.
- [x] 8.4 **Checkpoint (design.md Open Question 2 / proposal Open Question 2)**: browser-verify (criterion 22) whether the single `community.error.assignmentTargetNotFound` message is honest across all three 404 causes; if an admin cannot tell a mistyped UUID from a stale page, record it as a named follow-up (the `code` mechanism already exists to extend) rather than silently accepting. **Verified**: assigning a well-formed but nonexistent `userId` on a real community's detail page shows "This community or user could not be found." — honest in context, since an admin reaching this form already knows the community resolved (page-level `useCommunity` not-found is a separate, distinct message shown earlier if the community itself is missing) and can reasonably infer the userId is wrong. Not treated as confusing enough to warrant a follow-up; the deferred `code`-based disambiguation remains available if real usage proves otherwise.
- [x] 8.5 Browser-verify all 22 success criteria against `npm run dev` (CLAUDE.md "Verifying UI Changes"), including criteria 8/10 (exclusivity observed live), 11/12 (technician independence), 18 (no raw enum anywhere). **Verified live**: 1-14, 16-21 confirmed either by direct browser interaction (list/create/edit/soft-delete/detail/assign/exclusivity-swap/deactivate/reactivate/technician-independence/ineligible-role message/already-assigned message/unauthenticated redirect) or by the 8.1-8.3 static guards + full test suite. Criterion 15 (`TransactionConflictError` message) is not deterministically reproducible through manual UI interaction alone (requires a genuine concurrent-write race) — verified instead via code inspection (distinct message key exists, no automatic retry anywhere in `AssignmentSection.tsx`) plus the existing differential unit test, consistent with how PR2's own test suite covers this case. Non-`SYSTEM_ADMIN` NotAuthorized surface (criterion 19's other half) reuses `ProtectedRoute` unmodified from `users-minimal-ui`, already both unit- and browser-verified in that slice.
- [x] 8.6 Confirm `proposal.md`'s 22-item checklist checked off with evidence; specifically confirm criterion 18 (enum-label mapping) was delivered in Phases 3/4/7, not patched here — do not repeat `users-minimal-ui`'s late PR9 fix. **Confirmed**: criterion 18 was delivered incrementally — `locale-labels.ts` (PR4), `assignment-status-labels.ts` (PR3, i18n values filled PR7) — not patched retroactively in PR8. `proposal.md`'s checklist updated with `[x]` and this evidence trail.

## Rules Applied
- Strict TDD: RED/GREEN pairs on all logic-bearing files (409 controller mapping, `api/community.ts`, `error-messages.ts`, `AssignmentSection.tsx`, `use-community.ts`, and RTL tests for all 4 pages); union types, label-map modules, i18n JSON entries, and route wiring are mechanical.
- `AssignmentSection` no-behavioral-props discipline (design.md Decision 3) is a hard rule, not a style preference: `sdd-apply` must not add `isExclusive`/`mode`/similar, and `sdd-verify` must grep for its absence (task 3.3).
- No client code branches on the server's English `message` string (spec "No Server-Message String Coupling") — enforced by the Phase 2 differential test and the Phase 8 grep guard.
- Mutations refetch; the UI never patches local state to predict server-side exclusivity outcomes (proposal Approach, design.md Decision 2/3) — enforced by the Phase 3 and Phase 7 swap tests.
- API-first sequencing: Phase 1 lands before any web error-mapping work (Phase 2) is written against real `code` values, mirroring `users-minimal-ui`'s Phase 1 discipline.
- Both design.md Open Questions are apply-time checkpoints, not silently dropped: task 1.5 (`IneligibleRoleError` reachability) and task 8.4 (404 message honesty, gated on browser verification).
- Entry-point links (5.4, 6.4, 7.4) are added in the same PR as their target page — do not defer them the way `users-minimal-ui` PR6 did.
