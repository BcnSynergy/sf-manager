# Tasks: Maintenance Company + `User.maintenanceCompanyId`

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~3400-3600 (shared refactor touching 2 existing controllers, 1 migration, 1 new module across 4 layers, `users` domain+app+infra+presentation deltas, 5 web pages/forms, 3 locale files, full e2e coverage) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR13 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|---|---|---|---|---|
| 1 | Extract `buildCodedError` to `shared/presentation/http/coded-error.ts`; migrate `users` + `community` controllers | PR 1 | ~180 | Mechanical, zero behavior diff, guarded by existing e2e `body.code` assertions (proposal correction). Must land before PR 8's controller |
| 2 | Prisma migration: `MaintenanceCompany` table, `User.maintenanceCompanyId`, hand-written FK + partial unique index | PR 2 | ~180 | No behavior change; unblocks everything downstream |
| 3 | `maintenance-company` domain: entity, deletion policy, 3 errors | PR 3 | ~220 | Depends on PR 2 (types only); zero Prisma (ADR-013) |
| 4 | Authorization: extend `Permission`, grant `SYSTEM_ADMIN` row only | PR 4 | ~50 | Independent of PR 3 |
| 5 | `users` domain+infra deltas: entity field, `MaintenanceCompanyLookup` port+adapter, `countActiveByMaintenanceCompany`, assignment policy+errors | PR 5 | ~320 | Depends on PR 2; needed by PR 7 (count) and PR 6 (lookup) |
| 6 | `users` use-case wiring + presentation + shared schema: create/update use cases, error codes, DTOs, `.superRefine` | PR 6 | ~350 | Depends on PR 5 |
| 7 | `maintenance-company` application: port + 4 CRUD use cases + fake + validation schema | PR 7 | ~280 | Depends on PR 3, PR 5 (count method) |
| 8 | `maintenance-company` infra+presentation: adapter, controller, DTOs, module wiring, `app.module.ts` | PR 8 | ~340 | Depends on PR 1, PR 4, PR 7 |
| 9 | Web: api client, error-messages, List+Create pages, i18n, `App.tsx` routes | PR 9 | ~380 | Depends on PR 8 |
| 10 | Web: Edit page + route | PR 10 | ~160 | Depends on PR 9 |
| 11 | Web: users forms company selector, list company-name, `UserErrorCode` mirror, i18n | PR 11 | ~320 | Depends on PR 6, PR 9 |
| 12 | E2E: `maintenance-company.e2e-spec.ts` full lifecycle + auth matrix | PR 12 | ~350 | Depends on PR 8 |
| 13 | E2E: `users.e2e-spec.ts` additions + browser verification pass | PR 13 | ~350 | Depends on PR 6, PR 11 |

## Phase 1: Shared Error Envelope Extraction (PR 1)
- [x] 1.1 Create `apps/api/src/shared/presentation/http/coded-error.ts` — `buildCodedError<TCode>(status, message, code)` + `STATUS_TEXT` map (design Decision 1).
- [x] 1.2 `users.controller.ts`: delete private `buildConflictException`, use shared helper for all existing causes. The new 400 (`MAINTENANCE_COMPANY_NOT_FOUND`) is NOT added here — `MaintenanceCompanyNotFoundError` and the code literal don't exist until PR6 (`users` gains `maintenanceCompanyId`), so there is no code path that could throw it yet; adding it now would be dead/unreachable code. Left as a code comment pointing at PR6.
- [x] 1.3 `community.controller.ts`: same mechanical migration (proposal correction — isolated, zero behavior diff).
- [x] 1.4 Verify existing `users.e2e-spec.ts` and `community.e2e-spec.ts` `body.code` assertions pass unchanged (regression guard, no new tests). Also updated the two controllers' pre-existing unit specs (`users.controller.spec.ts`, `community.controller.spec.ts`) to assert `HttpException` instead of `ConflictException`, since `buildCodedError` constructs a plain `HttpException` rather than the status-specific subclass — an internal-implementation-detail test update, not a behavior change (HTTP status/body are unaffected, confirmed by the unchanged e2e assertions).

## Phase 2: Schema & Migration (PR 2)
- [x] 2.1 `schema.prisma`: add `MaintenanceCompany` model (`id`,`name`,`taxId`,`contactInfo`,`deletedAt`), `User.maintenanceCompanyId` + `@@index`; comment block flagging the Prisma-invisible index/FK.
- [x] 2.2 Hand-written migration SQL: `CreateTable`, nullable column, `User_maintenanceCompanyId_idx`, partial unique index `MaintenanceCompany_taxId_active_key` (`WHERE "deletedAt" IS NULL`), FK `ON DELETE RESTRICT` — mirror `20260825120000_add_community_and_assignments`.
- [x] 2.3 Verify migration applies cleanly in dev; confirm `prisma migrate dev` does not regenerate/drop the hand-written index or FK. **Finding**: it does — `prisma migrate dev --create-only` generated 4 `DropForeignKey` statements for `CommunityRepresentative`/`CommunityTechnician`'s hand-written FKs (invisible to Prisma, no `@relation`, ADR-013), which were manually deleted from the migration file before applying. Guarded going forward by `maintenance-company-migration.integration.spec.ts` (pg_indexes + pg_constraint checks, including a regression assertion that the 4 community FKs still exist).

## Phase 3: Maintenance Company Domain (PR 3)
- [x] 3.1 RED/GREEN `maintenance-company.entity.ts`/`.spec.ts` — plain fields, no Prisma (ADR-013, Decision 3).
- [x] 3.2 RED/GREEN `maintenance-company-deletion.policy.ts`/`.spec.ts` — `assertNoActiveUsersAttached(count)`, table-driven 0/1/n.
- [x] 3.3 `domain/errors/{tax-id-already-in-use,maintenance-company-has-active-users,maintenance-company-not-found}.error.ts`. No `TransactionConflictError` (Decision 6).

## Phase 4: Authorization (PR 4)
- [x] 4.1 `shared/application/authorization/permission.ts` — add `maintenanceCompany:create|read|update|delete`.
- [x] 4.2 RED/GREEN `role-permission.checker.ts` spec — `SYSTEM_ADMIN` gets all 4; other 4 roles stay `[]`. Reused the existing exhaustive `ALL_PERMISSIONS x NON_ADMIN_ROLES` table-driven spec — the 4 new permissions were added to `ALL_PERMISSIONS`, which extends both the SYSTEM_ADMIN-allow assertions and the non-admin-deny matrix for free (65 cases total, up from 45).

## Phase 5: Users Domain + Lookup Infra (PR 5)
- [x] 5.1 `users/domain/user.entity.ts`: add `maintenanceCompanyId: string | null`. No constructor validation (Decision 5 landmine). Made OPTIONAL in `UserProps` (defaults to `null`) so every existing `new User(...)` caller across the codebase keeps compiling — see Deviations.
- [x] 5.2 RED/GREEN `users/domain/maintenance-company-assignment.policy.ts` — `assertCompanyMatchesRole(role, companyId)`, table-driven over all 5 roles × present/absent (10 cases).
- [x] 5.3 `users/domain/errors/{invalid-maintenance-company-assignment,maintenance-company-not-found}.error.ts`.
- [x] 5.4 `users/application/ports/maintenance-company-lookup.port.ts` — `existsActive(id)` + `MAINTENANCE_COMPANY_LOOKUP` token (Decision 4, no cycle).
- [x] 5.5 `users/infrastructure/persistence/prisma-maintenance-company-lookup.repository.ts` — existence probe via `PrismaService` (`@Global()`). RED/GREEN via integration spec against real Postgres.
- [x] 5.6 `users/application/ports/user.repository.port.ts`: add `countActiveByMaintenanceCompany(id)`; `updateById` signature gains the field.
- [x] 5.7 `prisma-user.repository.ts` + `user.mapper.ts`: new column mapping + `countActiveByMaintenanceCompany` (uses `withDefaultFilter`). Mechanical fallout: `InMemoryUserRepository` and two `jest.Mocked<UserRepository>`/manual-fake compile bridges (`login.use-case.spec.ts`, `test/auth.e2e-spec.ts`) updated to keep implementing the extended port.
- [x] 5.8 `users.module.ts`: bind `MAINTENANCE_COMPANY_LOOKUP`. Imports nothing new from `maintenance-company`. DI graph verified by `app.module.spec.ts`.

## Phase 6: Users Use Cases + Presentation + Shared Schema (PR 6)
- [x] 6.1 RED/GREEN `create-user.use-case.ts` — `assertCompanyMatchesRole` then (if supplied) `existsActive`.
- [x] 6.2 RED/GREEN `update-user.use-case.ts` — the REQUIRED shape and the liveness check are both evaluated against the RESULTING role/company pair on every PATCH regardless of which fields it touches (spec.md OQ2, "Grandfathered Maintenance-Role Users" ADDED requirement — stricter than design.md's original payload-scoped call, per its own "Handoff to sdd-spec" note). **PR6 fresh-context review finding (fixed via a follow-up commit on the same branch)**: the liveness check originally stayed payload-scoped (only ran when `maintenanceCompanyId` was itself present in the request), which meant a PATCH that re-promoted a user into a maintenance role without supplying `maintenanceCompanyId` skipped the liveness check on the inherited id — silently allowing re-promotion into a role referencing a soft-deleted company. Fixed to run `existsActive()` whenever the resulting state requires a maintenance company, regardless of payload presence. NOT_ALLOWED stays payload-scoped as before (design.md Decision 5) — a bare demotion away from a maintenance role still leaves a stale company id untouched.
- [x] 6.3 `packages/validation/src/users/{create,update}-user.schema.ts`: `MAINTENANCE_ROLES`, `isMaintenanceRole`, `.superRefine` shapes 1 & 2. Mechanical per Rules Applied — no dedicated RED/GREEN (package has no test harness: `"test": "echo \"no tests yet\""`); correctness is covered by the use-case specs exercising the schema indirectly via the API layer's contract.
- [x] 6.4 `users/presentation/user-error-code.ts`: add `MAINTENANCE_COMPANY_REQUIRED` (400), `MAINTENANCE_COMPANY_NOT_ALLOWED` (400), `MAINTENANCE_COMPANY_NOT_FOUND` (400). **Finding**: design.md Decision 5 originally specified shapes 1/2 as a *plain* 400 with no code ("a code would be dead weight"); the user-management spec.md's ADDED/MODIFIED requirements ("Create User", "Update User", "Last-Admin Lockout") explicitly mandate these two codes, so the spec supersedes that design call — `InvalidMaintenanceCompanyAssignmentError` gained a `reason: 'REQUIRED' | 'NOT_ALLOWED'` discriminant to drive the mapping instead of splitting into two error classes.
- [x] 6.5 `users/presentation/dto/**`: `maintenanceCompanyId` on `UserResponseDto` (request DTOs are Zod-inferred, already covered by 6.3). `ListUsersUseCase`/`ListedUser` also gained the field — required for `UserResponseDto` (shared by create/update/list) to type-check, and needed by Phase 11's list-page company-name resolution (design.md Decision 7).
- [x] 6.6 `apps/web/src/api/client.ts`: fix stale comment (`code` no longer 409-exclusive).

## Phase 7: Maintenance Company Application (PR 7)
- [x] 7.1 `maintenance-company.repository.port.ts` — `Symbol` token; `create`/`findById`/`findAll`/`updateById`/`softDeleteById`. No `transactional()` (Decision 6), no `findByTaxId` (Decision 2).
- [x] 7.2 RED/GREEN `create-maintenance-company.use-case.ts`.
- [x] 7.3 RED/GREEN `list-maintenance-companies.use-case.ts` — excludes soft-deleted.
- [x] 7.4 RED/GREEN `update-maintenance-company.use-case.ts` — 404 on missing id.
- [x] 7.5 RED/GREEN `soft-delete-maintenance-company.use-case.ts` — `findById` -> `countActiveByMaintenanceCompany` -> `assertNoActiveUsersAttached` -> `softDeleteById`; assert `softDeleteById` never called when blocked.
- [x] 7.6 `in-memory-maintenance-company.repository.ts` fake — must reproduce *partial* taxId uniqueness (active rows only).
- [x] 7.7 `packages/validation/src/maintenance-company/maintenance-company.schema.ts` + `src/index.ts` — `taxIdSchema` (trim+uppercase), create/update schemas.

## Phase 8: Maintenance Company Infra + Presentation (PR 8)
- [x] 8.1 `prisma-maintenance-company.repository.ts` (extends `SoftDeletableRepository`) + `maintenance-company.mapper.ts`; `P2002` -> `TaxIdAlreadyInUseError` unconditionally (Decision 2 gotcha) on `create` and `updateById`. **Also closes the PR7-documented cross-repo delete race** (design.md Decision 4 addendum): `softDeleteById` now runs a single atomic `UPDATE ... WHERE ... AND NOT EXISTS (SELECT 1 FROM "User" ...)` statement and returns `Promise<boolean>` instead of `Promise<void>`; `SoftDeleteMaintenanceCompanyUseCase` re-checks on a `false` return to report the precise cause (`MaintenanceCompanyHasActiveUsersError` or `MaintenanceCompanyNotFoundError`) instead of silently succeeding.
- [x] 8.2 Integration: partial index present in `pg_indexes`; FK exists; active+active same-taxId rejected, active+soft-deleted pair accepted. Also covers `softDeleteById` against real Postgres with an active `User.maintenanceCompanyId` row attached — `deletedAt` stays `null`, proving the `NOT EXISTS` guard actually runs against the database, not just the in-memory fake.
- [x] 8.3 `maintenance-company.controller.ts` CRUD routes + `dto/**` + Swagger, using `buildCodedError` from PR 1.
- [x] 8.4 `maintenance-company-error-code.ts` — exactly 2 values (`TAX_ID_ALREADY_IN_USE`, `MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`).
- [x] 8.5 `maintenance-company.module.ts` — imports `UsersModule` for `USER_REPOSITORY` (Decision 4, no `forwardRef`); register in `app.module.ts`.

## Phase 9: Web — List, Create, i18n (PR 9)
- [x] 9.1 `apps/web/src/api/maintenance-company.ts` — typed calls + mirrored `MaintenanceCompanyErrorCode`.
- [x] 9.2 `apps/web/src/maintenance-company/error-messages.ts` — status/code-only map, mirrors `community/error-messages.ts`.
- [x] 9.3 `MaintenanceCompaniesListPage.tsx` — loading/empty/error states, name/taxId/contactInfo columns. Scoped to list+create only per this phase's task list — no edit/delete affordance yet; Phase 10 will need to add the row-level edit entry point when `MaintenanceCompanyEditPage.tsx` lands (a small addition to tasks.md's Phase 10 file list, not present in the original breakdown — flagged as a finding).
- [x] 9.4 `MaintenanceCompanyCreatePage.tsx` — client validation via shared schema, duplicate-taxId message.
- [x] 9.5 `App.tsx` — list + create routes under `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`, static-before-dynamic ordering.
- [x] 9.6 `i18n/locales/{en,es,ca}.json` — `maintenanceCompany.*` keys incl. `maintenanceCompany.unknown`; parity test (extended `locales.test.ts` with a `REQUIRED_MAINTENANCE_COMPANY_KEY_PATHS` existence guard mirroring the community precedent).

## Phase 10: Web — Edit (PR 10)
- [x] 10.1 `MaintenanceCompanyEditPage.tsx` — prefilled form, confirmed soft-delete via `ConfirmDialog`, delete-blocked message distinct from duplicate-taxId. Inline list-and-select (no shared hook — single caller, mirrors `UserEditPage.tsx`'s precedent, not `CommunityEditPage.tsx`'s shared-hook one, since there is no maintenance-company detail page). Save and delete are two independent error surfaces (`maintenance-company-edit-error` vs. `maintenance-company-edit-delete-error`) so a duplicate-taxId save failure can never be confused with a delete-blocked failure — both already had distinct i18n keys from PR9 (`error.duplicateTaxId` / `error.hasActiveUsers`), reused as-is via `mapApiErrorToMessageKey`. **Finding (resolved, not scope creep)**: `MaintenanceCompaniesListPage.tsx` gained a per-row "Edit" link — without it the edit page was unreachable from the UI (flagged as an open question in Phase 9's apply-progress); this is glue for 10.1/10.2 to be reachable, not new scope, and unlike `community` (whose delete lives on the list page), this list page still owns no destructive action.
- [x] 10.2 `App.tsx` — edit route (`/maintenance-companies/:id/edit`), static-before-dynamic ordering preserved (the pre-existing comment anticipating this route from PR9 is now resolved).

## Phase 11: Web — Users Forms + List (PR 11)
- [x] 11.1 `UserCreatePage.tsx` / `UserEditPage.tsx` — role-conditional company `<select>` populated from `GET /maintenance-companies`; appears/required only for the 2 maintenance roles; cleared from payload otherwise. Fetched once on mount (`UserCreatePage`: no existing id to resolve, just dropdown options; `UserEditPage`: also preselects the found row's `maintenanceCompanyId`), in parallel with `listUsers()` on the edit page (neither effect awaits the other, per design.md Decision 7's "never sequentially"). Both pages share the `isMaintenanceRole` predicate from `@sf-manager/validation` — no hardcoded role list — and build the submitted payload conditionally on the CURRENT role (not stored selector state), so a role change away from maintenance clears the selection immediately and the payload omits `maintenanceCompanyId` rather than sending a stale or empty value.
- [x] 11.2 `UsersListPage.tsx` — added a `columnCompany` cell resolved via an id->name map built from `GET /maintenance-companies`, fetched once on mount in a second effect (parallel to `loadUsers()`). Never renders the raw UUID: non-maintenance-role rows render an empty cell; maintenance-role rows with a `null` id (grandfathered) or an id absent from the map (soft-deleted company, design.md Decision 6's accepted anomaly) both render `maintenanceCompany.unknown`.
- [x] 11.3 `apps/web/src/api/users.ts` — `UserErrorCode` gains `MAINTENANCE_COMPANY_REQUIRED|MAINTENANCE_COMPANY_NOT_ALLOWED|MAINTENANCE_COMPANY_NOT_FOUND`; `User` gains `maintenanceCompanyId: string | null` (Decision 7 — id only, name resolved client-side); `CreateUserPayload`/`UpdateUserPayload` gain optional `maintenanceCompanyId`.
- [x] 11.4 `apps/web/src/users/error-messages.ts` — 3 new `CODE_MESSAGE_KEYS` entries, one per cause, distinguishable from each other and from the pre-existing 3 codes (spec "Cause-Specific Error Messaging").
- [x] 11.5 `i18n/locales/{en,es,ca}.json` — `users.list.columnCompany`, `users.create/edit.companyLabel`/`companyPlaceholder`, `users.error.maintenanceCompany{Required,NotAllowed,NotFound}`. Parity test (`locales.test.ts`) extended with a `REQUIRED_USER_MAINTENANCE_COMPANY_KEY_PATHS` existence guard, mirroring the `REQUIRED_MAINTENANCE_COMPANY_KEY_PATHS` precedent from PR9.

## Phase 12: E2E — Maintenance Company (PR 12)
- [x] 12.1 `maintenance-company.e2e-spec.ts`: CRUD happy paths; `body.code` asserted for both codes. Follows `community.e2e-spec.ts`'s/`users.e2e-spec.ts`'s HERMETIC pattern (the codebase-wide e2e precedent set by `auth-minimal-skeleton`'s design.md: in-memory fakes overriding `USER_REPOSITORY`/`MAINTENANCE_COMPANY_REPOSITORY`/`MAINTENANCE_COMPANY_LOOKUP`/`TOKEN_DENYLIST`/`PrismaService`, no real Postgres — this module's own design.md only mandates in-memory fakes for the Unit row, not E2E) — not a real-DB e2e suite; the real-DB atomic soft-delete guard is already covered by Phase 8's Prisma integration spec.
- [x] 12.2 E2E: duplicate active taxId rejected (create + update); taxId reusable after soft-delete.
- [x] 12.3 E2E: delete blocked while active user attached; company `deletedAt` stays null (asserted via direct repository read); no user modified (`toEqual` on the full pre/post user record).
- [x] 12.4 E2E: delete succeeds after reassigning the blocking user to a different company; delete succeeds after soft-deleting the blocking user; a user soft-deleted before any delete attempt never blocks in the first place. `MAINTENANCE_COMPANY_LOOKUP` stubbed as always-live (an intentional simplification — its precise REQUIRED/NOT_ALLOWED/NOT_FOUND contract is Phase 13's `users.e2e-spec.ts` concern, not this suite's).
- [x] 12.5 E2E: 401 unauthenticated / 403 non-admin (incl. a maintenance-role holder with a `maintenanceCompanyId` matching the very resource under test) on every route (POST/GET/PATCH/DELETE); SYSTEM_ADMIN permitted.

## Phase 13: E2E — Users Deltas + Browser Verification (PR 13)
- [x] 13.1 `users.e2e-spec.ts`: shapes 1-3 (missing company, disallowed company, dead/soft-deleted company) with correct codes. **Finding (reported this session, FIXED in a same-PR follow-up commit)**: shapes 1 (REQUIRED) and 2 (NOT_ALLOWED) were originally only reachable through real HTTP with a `code` field when the payload alone could not decide the violation (PATCH's REQUIRED direction; a PATCH supplying `maintenanceCompanyId` without `role`). For `POST /users` (always) and for `PATCH /users/:id` when `role` is present alongside `maintenanceCompanyId` (the exact combination spec.md's "Missing company for a maintenance role rejected" / "Company id rejected for a non-maintenance role" / "Company id rejected when changing role to a non-maintenance role" scenarios describe), the shared Zod `.superRefine` at `ZodValidationPipe` rejected first with a plain 400 (Zod issues as `message`, no `code`) — the controller/use case, and therefore `UsersController.mapMaintenanceCompanyError`'s `code` assignment, never ran. Verified empirically via a throwaway diagnostic e2e run (not committed) inspecting the raw response bodies.
  **Fix mechanism**: `applyMaintenanceCompanyRefinement`/`applyMaintenanceCompanyNotAllowedRefinement` (`packages/validation/src/users/create-user.schema.ts`) now tag their `ctx.addIssue(...)` calls with `params: { maintenanceCompanyCode: 'MAINTENANCE_COMPANY_REQUIRED' | 'MAINTENANCE_COMPANY_NOT_ALLOWED' }` — a machine-readable discriminator, not a message string-match. A new `MaintenanceCompanyZodValidationPipe` (`apps/api/src/modules/users/presentation/pipes/`), a small subclass of the shared `ZodValidationPipe` (whose `schema` field is now `protected` instead of `private` to allow this), re-parses the body, looks for that tag, and throws `buildCodedError(400, issue.message, code)` before Nest ever reaches the controller method — any other schema failure still falls through to the generic `BadRequestException` unchanged. `UsersController`'s two `@Body(...)` pipe instantiations now use this subclass instead of the generic one. All 3 previously-gap e2e assertions (2 on POST, 1 newly added on PATCH for the role-present + non-maintenance + company-present combination, which had not been covered by a committed test) now assert the full `{statusCode, error, code}` body instead of a bare 4xx.
- [x] 13.2 E2E: reassignment via `PATCH` reflects immediately; demotion away from a maintenance role leaves `maintenanceCompanyId` untouched (regression).
- [x] 13.3 E2E: grandfathered companyless user — unrelated-field PATCH rejected with `MAINTENANCE_COMPANY_REQUIRED`; supplying a company resolves it; `GET` remains unrestricted.
- [x] 13.4 E2E: `ROLE_PERMISSIONS` non-admin rows (incl. both maintenance roles) still `[]` after the slice. Added the one missing angle from the `users` e2e suite's own perspective: a `MAINTENANCE_TECHNICIAN` caller (with its own `maintenanceCompanyId` set) gets 403 on every `/users` route — the pre-existing "Anonymous and non-admin access control" group only exercised a `MANAGER` caller, not a maintenance-role holder specifically (authorization spec: "A maintenance-role user cannot access any endpoint via their company association"). `role-permission.checker.spec.ts` (Phase 4) already covers the `ROLE_PERMISSIONS` table exhaustively at the unit level.
- [x] 13.5 Browser verification (`npm run dev`, `claude-in-chrome`, `SYSTEM_ADMIN` session): unauthenticated `/maintenance-companies` redirects to `/login`. Created a company, created a `MAINTENANCE_TECHNICIAN` requiring it (role-conditional selector shown, required); attempted delete on the in-use company — blocked with "This maintenance company still has active users. Reassign or remove them first."; reassigned the technician to a different company via `UserEditPage` (selector correctly preselected the old company first); retried delete — succeeded. Role dropdown show/hide of the company selector confirmed both directions (create and edit pages). Users list renders the resolved company **name**, never the raw UUID. Logged in as the (now-reassigned) `MAINTENANCE_TECHNICIAN` and confirmed `/maintenance-companies` returns "Not authorized" (403) even though it is nominally "their own" domain, per the RBAC table. es/ca locale spot-check done live via `await (await import('/src/i18n/index.ts')).default.changeLanguage('es'|'ca')` in the browser console (no in-app language switcher exists yet, ADR-007) — both locales render genuine, distinct translations for the new company selector/list-column strings, not placeholders. Test data cleaned up afterward (test company deleted, test user deactivated).
- [x] 13.6 Full API + web suites, lint, build all pass; `no-restricted-imports` passes; grep confirms no `CommunityMaintenanceAssignment` artifact exists. Verified this session: `npm run test --workspace=apps/api` 57/57 suites, 377/377 tests; `npm run test:e2e --workspace=apps/api` 5/5 suites, 122/122 tests; `npm run test --workspace=apps/web` 27/27 files, 300/300 tests; `npm run lint` 0 errors (4 pre-existing unrelated warnings in `auth.controller.spec.ts`, `no-restricted-imports` included in this run and clean); `npm run build` (full monorepo) succeeds. `grep -rl "CommunityMaintenanceAssignment"` across `apps/`, `packages/`, `openspec/` returns no matches.

## Rules Applied
- Strict TDD: RED/GREEN on all logic-bearing files (entities, policies, use cases, mappers, guards); migrations/DTOs/module wiring/schema files are mechanical, no RED/GREEN required.
- PR 1 (coded-error extraction) is isolated and mechanical per the proposal's post-design correction — no business logic in the same PR, reverts independently.
- Design Decisions 1-7 (envelope builder location, partial index as sole enforcement, plain fields, DI-cycle-free lookup, payload-scoped conditional check, no `transactional()`, client-side name resolution) are settled — do not re-litigate at apply time.
- Grandfathered-user PATCH rule follows the spec's strict scope: any edit, not just role/company edits, is rejected without a valid company.
