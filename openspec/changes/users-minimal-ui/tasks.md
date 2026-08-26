# Tasks: Minimal Web UI for the `users` Domain

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1400-1500 (1 API file + e2e test, 2 web foundation modules, 1 role-gate change, 1 dialog component, 1 error-mapping module, 3 pages, 3-file i18n x3 increments, routing) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR9 (see Suggested Work Units); each unit stays under ~300 lines |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | API: additive `code` field on 409 responses + e2e regression | PR 1 | No behavior change to existing fields; unblocks UI error-mapping work |
| 2 | Web foundation: `apiFetch`/`ApiError` + `api/users.ts` (4 typed calls) | PR 2 | Depends on PR 1 (types mirror `user-error-code.ts`); tests use mocked `fetch` |
| 3 | Web foundation: `ProtectedRoute` `allowedRoles?` prop + `NotAuthorized` | PR 3 | Independent of PR 2; small |
| 4 | Web foundation: `ConfirmDialog` on native `<dialog>` (+ jsdom polyfill if needed) | PR 4 | Independent of PR 2/3; small |
| 5 | Web: `error-messages.ts` (`ApiError` -> i18n key map) | PR 5 | Depends on PR 2 (types) |
| 6 | `UsersListPage` + base `users.*`/`common.*` i18n keys + `/users` route | PR 6 | Depends on PR 2, 3, 4, 5 |
| 7 | `UserCreatePage` + create i18n keys + `/users/new` route | PR 7 | Depends on PR 2, 3, 5; parallel to PR 8 |
| 8 | `UserEditPage` + edit i18n keys + `/users/:id/edit` route | PR 8 | Depends on PR 2, 3, 5; parallel to PR 7 |
| 9 | i18n key-set parity test + full lint/test verification | PR 9 | Depends on PR 6, 7, 8 |

## Phase 1: API — 409 Error Code (PR 1)
- [x] 1.1 Create `apps/api/src/modules/users/presentation/user-error-code.ts` — `UserErrorCode` union (`EMAIL_ALREADY_IN_USE` | `LAST_SYSTEM_ADMIN` | `TRANSACTION_CONFLICT`); mechanical.
- [x] 1.2 RED/GREEN `users.controller.ts` — `mapMutationError`/`create` build `new ConflictException({ statusCode: 409, error: 'Conflict', message, code })` per error class; Swagger conflict responses document `code`.
- [x] 1.3 Extend `apps/api/test/users.e2e-spec.ts` (lines ~192, 370, 397) — assert `body.code` equals the expected value for each of the 3 409 causes; assert `statusCode`/`error`/`message` unchanged in shape.

## Phase 2: Web Foundation — API Client (PR 2)
- [x] 2.1 RED/GREEN `apps/web/src/api/client.ts` + `client.test.ts` — `apiFetch`: 204 -> `undefined`; 409 -> `ApiError{status,code}`; malformed body -> `ApiError` without `code`; network throw -> `status 0`.
- [x] 2.2 RED/GREEN `apps/web/src/api/users.ts` + test — `listUsers`/`createUser`/`updateUser`/`deactivateUser`; mirrored `UserErrorCode` literal union.

## Phase 3: Web Foundation — Role Gating (PR 3)
- [x] 3.1 RED/GREEN `ProtectedRoute.tsx` + `ProtectedRoute.test.tsx` — add `allowedRoles?: Role[]`; precedence `isLoading` -> null, no user -> `/login`, role not in `allowedRoles` -> `NotAuthorized`, allowed/no prop -> children (legacy behavior unchanged).
- [x] 3.2 Create `apps/web/src/auth/NotAuthorized.tsx` — renders `common.notAuthorized*` keys; mechanical (pure render, no branching logic).

## Phase 4: Web Foundation — Confirm Dialog (PR 4)
- [ ] 4.1 RED/GREEN `apps/web/src/components/ConfirmDialog.tsx` + test — native `<dialog>`, `showModal`/`close`, confirm/cancel callbacks, i18n'd labels.
- [ ] 4.2 If jsdom 30 lacks `HTMLDialogElement.showModal`/`close`, add a minimal polyfill to `apps/web/src/test/setup.ts` (mechanical, verify at apply time per design's Open Question).

## Phase 5: Web — Error-Message Mapping (PR 5)
- [ ] 5.1 RED/GREEN `apps/web/src/users/error-messages.ts` + test — `ApiError{status,code}` -> i18n key: `EMAIL_ALREADY_IN_USE` -> `users.error.duplicateEmail`, `LAST_SYSTEM_ADMIN` -> `users.error.lastSystemAdmin`, `TRANSACTION_CONFLICT` -> `users.error.tryAgain`, 400 -> `users.error.weakPassword`, 404 -> `users.error.notFound`, `status 0`/unknown -> `common.error.network`.
- [ ] 5.2 Test asserts the mapping never branches on `error.message` text (guards "No Server-Message String Coupling").

## Phase 6: Users List Page (PR 6)
- [ ] 6.1 Add base `users.*`/`common.*` i18n keys (list, loading/empty/error, `notAuthorized`, shared error keys) to `en.json`, `es.json`, `ca.json` — real translations, mechanical.
- [ ] 6.2 RED/GREEN `UsersListPage.tsx` + `UsersListPage.test.tsx` (RTL, mocked `api/users`) — loading/empty/error states; row render; deactivate button wired to `ConfirmDialog` then `deactivateUser`+refetch; deactivate hidden on `row.id === auth.user.id`.
- [ ] 6.3 Wire `/users` route into `App.tsx` under `<ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>`.

## Phase 7: User Create Page (PR 7)
- [ ] 7.1 Add `users.create.*` i18n keys to `en.json`, `es.json`, `ca.json`.
- [ ] 7.2 RED/GREEN `UserCreatePage.tsx` + `UserCreatePage.test.tsx` — `createUserSchema`/`passwordSchema` `safeParse` blocks submit before any fetch; success navigates to list without manual reload; duplicate-email 409 shows `users.error.duplicateEmail`.
- [ ] 7.3 Wire `/users/new` route into `App.tsx`.

## Phase 8: User Edit Page (PR 8)
- [ ] 8.1 Add `users.edit.*` i18n keys to `en.json`, `es.json`, `ca.json`.
- [ ] 8.2 RED/GREEN `UserEditPage.tsx` + `UserEditPage.test.tsx` — `listUsers()` + filter by `:id` (Decision 5); prefill `email`/`role`, no password field; `role` disabled when `:id === auth.user.id`; not-found state when `:id` absent from the list; `LAST_SYSTEM_ADMIN`/`TRANSACTION_CONFLICT` errors mapped distinctly.
- [ ] 8.3 Wire `/users/:id/edit` route into `App.tsx`.

## Phase 9: Integration & i18n Parity (PR 9)
- [ ] 9.1 Add a key-set equality test over `en`/`es`/`ca` locale JSONs (mechanical structural test, run after all `users.*`/`common.*` keys landed in PR 6-8).
- [ ] 9.2 Run full web + api lint/test suite; confirm success criteria checklist in `proposal.md`.

## Rules Applied
- Strict TDD: RED/GREEN pairs on all logic-bearing files (409 controller mapping, `apiFetch`/`api/users.ts`, `ProtectedRoute` role-check, `ConfirmDialog` interaction, `error-messages.ts`, and RTL component tests for the 3 pages); DTO/union types, i18n JSON entries, and route wiring are mechanical, no RED/GREEN needed.
- API-first sequencing: Phase 1 lands before any UI error-mapping work (Phase 5) is written against real `code` values, per design.md Decision 3.
- Role-gating (`ProtectedRoute allowedRoles`), fetch seam (`apiFetch`), and dialog pattern (`ConfirmDialog`) are explicitly reusable by the next retrofit slice (`community`), per design.md Decisions 1, 2, 4.
- Edit page reads via `listUsers()` + client-side filter (design.md Decision 5) — no `GET /users/:id` is introduced.
- No client code branches on the server's English `message` string (spec "No Server-Message String Coupling") — enforced by the Phase 5 test.
