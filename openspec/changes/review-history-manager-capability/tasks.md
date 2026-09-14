# Tasks: Manager Review-History Capability (`VIEW_ALL_REVIEWS`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1200–1600 total across 4 PRs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema + domain + persistence plumbing for `managerCapabilities` | PR 1 | base `main`; ~250–350 lines |
| 2 | Capability checker + `ReviewHistoryAccessService` MANAGER branch + permission grant | PR 2 | base `main`, depends on PR 1 merged; ~250–350 lines |
| 3 | `PATCH /users/:id` write path (schema, policy, use case, DTO, pipe rename) | PR 3 | base `main`, depends on PR 2 merged; ~350–450 lines |
| 4 | Web toggle + route/link widening + i18n + five-role E2E + docs/ADR + browser verification | PR 4 | base `main`, depends on PR 3 merged; ~350–450 lines |

## PR 1: Data Model & Persistence Plumbing

- [x] 1.1 `apps/api/prisma/schema.prisma`: add `ManagerCapability` enum (one member `VIEW_ALL_REVIEWS`) + `User.managerCapabilities ManagerCapability[] @default([])`, no index
- [x] 1.2 Write migration `apps/api/prisma/migrations/20260914…_add_user_manager_capabilities/migration.sql` (additive `CREATE TYPE` + `NOT NULL DEFAULT ARRAY[]`)
- [x] 1.3 Create `.../users/domain/manager-capability.ts` (hand-written union type, ADR-013)
- [x] 1.4 Modify `.../users/domain/user.entity.ts`: optional `managerCapabilities` prop, defaults `[]`, no constructor validation
- [x] 1.5 Modify `.../users/infrastructure/persistence/user.mapper.ts` for both directions
- [x] 1.6 Modify `.../users/application/ports/user.repository.port.ts`: `updateById` changes gains optional field
- [x] 1.7 Modify `.../users/application/use-cases/testing/in-memory-user.repository.ts` for fake parity
- [x] 1.8 (TDD) Integration test: `prisma-user.repository.integration.spec.ts` — column round-trip, default-empty (written, not executed — no local Postgres in this environment; compile-verified against real Prisma client types)
- [x] 1.9 (TDD) Integration test: migration spec — enum has exactly one label, `NOT NULL` default, existing rows read `[]`, hand-written FKs/indexes intact, simulated pre-migration drop per `review-session-migration.integration.spec.ts` precedent (written as `user-manager-capability-migration.integration.spec.ts`, not executed — same DB caveat as 1.8)
- [x] 1.10 Verify: `apps/api` build/lint/tests pass; no code reads the new column yet. Three separate gates (unit tests alone do NOT cover the integration/migration specs — `apps/api/package.json`'s jest config excludes `*.integration.spec.ts` via `testPathIgnorePatterns`, and e2e runs under its own config): `npm run test --workspace=apps/api` (unit, green), `npm run test:integration --workspace=apps/api` (integration — column round-trip + migration spec, real Postgres, green), `npm run test:e2e --workspace=apps/api` (e2e, includes the inverted "manager-capability mechanism exists only in the persistence layer so far" guard, green); eslint clean, `nest build` clean; 2 pre-existing unrelated tsc failures on `main` untouched

## PR 2: Capability Checker & Read-Side Scope

- [ ] 2.1 Create `shared/application/authorization/manager-capability.checker.port.ts` (`hasManagerCapability(userId, role, capability): Promise<boolean>` + `MANAGER_CAPABILITY_CHECKER` symbol)
- [ ] 2.2 Create `.../users/infrastructure/authorization/user-manager-capability.checker.ts`: exhaustive `switch`, `satisfies never`, `MANAGER` resolves via `findById`, re-checks persisted `role === 'MANAGER'`, no try/catch
- [ ] 2.3 Modify `.../users/users.module.ts`: bind + export `MANAGER_CAPABILITY_CHECKER`
- [ ] 2.4 (TDD) Unit test: checker — table-driven 5 roles × {none, granted, soft-deleted}; stale-JWT-role guard; `findById` called every invocation
- [ ] 2.5 Modify `.../review-session/application/services/review-history-access.service.ts`: `MANAGER` branch in `listForActor`/`loadByRole` — resolve capability, `[]`/`null` before any repo call if absent, else reuse `findCompleted{,ById}AcrossInstallation`
- [ ] 2.6 (TDD) Unit test: `ReviewHistoryAccessService` MANAGER dispatch — ungranted asserts repository `not.toHaveBeenCalled()`; granted reaches the shared read; other four branches re-asserted unchanged
- [ ] 2.7 Modify `.../auth/infrastructure/authorization/role-permission.checker.ts`: `MANAGER: ['reviewSession:read']`
- [ ] 2.8 Modify `role-permission.checker.spec.ts`: remove/restructure `INERT_NON_ADMIN_ROLES`, invert the `denies MANAGER on reviewSession:read` case, update stale comment
- [ ] 2.9 Modify `.../review-session/application/ports/review-session.repository.port.ts`: update "exactly ONE call site" comment to "two branches" (Decision 3)
- [ ] 2.10 Integration test: call-site guard — allowlist file unchanged, comment updated
- [ ] 2.11 E2E: five-role matrix widened — ungranted MANAGER gets `[]`/403 everywhere, other four scopes byte-unchanged; invert the two shipped 403-blanket assertions per design Testing Strategy
- [ ] 2.12 Verify: `MANAGER` holds only `reviewSession:read`; two `/review-sessions*` GET routes widen (accepted, named); no write route widened

## PR 3: Grant/Revoke Write Path

- [ ] 3.1 Create `packages/validation/src/users/manager-capability.schema.ts` (`managerCapabilitySchema`, `applyManagerCapabilitiesNotAllowedRefinement`, non-empty-array-only trigger)
- [ ] 3.2 Modify `packages/validation/src/index.ts`: re-export new schema module
- [ ] 3.3 Modify `packages/validation/src/users/update-user.schema.ts`: optional field + refinement, fixed precedence (maintenance-company refinement first)
- [ ] 3.4 Modify `packages/validation/src/users/create-user.schema.ts`: tag-key rename occurrences only, parse behaviour unchanged
- [ ] 3.5 (TDD) Unit test: `updateUserSchema` — accepts `[]`/`['VIEW_ALL_REVIEWS']`, rejects unknown member, refinement fires only when `role` present & non-MANAGER, dual-violation precedence test; `createUserSchema` unchanged
- [ ] 3.6 Create `.../users/domain/manager-capability.policy.ts`: `assertCapabilitiesAllowedForRole` + `resolveManagerCapabilities` (Decision 5 table incl. promotion-reset rule)
- [ ] 3.7 Create `.../users/domain/errors/invalid-manager-capability-assignment.error.ts`
- [ ] 3.8 (TDD) Unit test: policy module — both functions, all table rows including `undefined` no-ops and promotion reset
- [ ] 3.9 Modify `.../users/application/use-cases/update-user.use-case.ts`: policy calls, `changes` merge, `SERIALIZABLE` transaction generalized to every write touching `role`/`managerCapabilities`, result computed as `resolved ?? existing`
- [ ] 3.10 (TDD) Unit test: `UpdateUserUseCase` — grant, revoke via `[]`, absent no-op, clear-on-demotion, reject on non-MANAGER resulting role, round-trip reset
- [ ] 3.11 Modify `.../users/application/use-cases/{create,list}-user.use-case.ts`: carry entity value into DTO
- [ ] 3.12 Modify `.../users/presentation/dto/user-response.dto.ts`: add `managerCapabilities`
- [ ] 3.13 Rename `maintenance-company-zod-validation.pipe.ts(.spec.ts)` → `user-coded-zod-validation.pipe.ts(.spec.ts)`, tag key → `userErrorCode`
- [ ] 3.14 Modify `apps/api/src/shared/presentation/pipes/zod-validation.pipe.ts`: docblock comment only
- [ ] 3.15 Modify `.../users/presentation/user-error-code.ts`: add `MANAGER_CAPABILITIES_NOT_ALLOWED`
- [ ] 3.16 Modify `.../users/presentation/users.controller.ts`: `@ApiBody` + 400 doc, pipe rename call sites, `mapMutationError` branch for `InvalidManagerCapabilityAssignmentError`
- [ ] 3.17 Modify `apps/api/test/users.e2e-spec.ts:592-593`: comment-only rename update
- [ ] 3.18 E2E: grant/revoke round trip, absent-field no-op, role-change clear, reject-on-non-MANAGER 400
- [ ] 3.19 Verify: in-memory fake parity (absent leaves value, `[]` clears); `create` path untouched

## PR 4: Web UI, i18n, Docs & Verification

- [ ] 4.1 Modify `apps/web/src/api/users.ts`: `managerCapabilities` on `User`/`UpdateUserPayload`, new error code
- [ ] 4.2 Modify `apps/web/src/users/error-messages.ts`: code → i18n key
- [ ] 4.3 Modify `apps/web/src/pages/UserEditPage.tsx` (+ test): role-conditional checkbox, prefill from `listUsers()`, reset on role change away, always submits array while role is `MANAGER`
- [ ] 4.4 Modify `apps/web/src/App.tsx`, `auth/ProtectedRoute.test.tsx`: `/review-history*` `allowedRoles` 4 → 5
- [ ] 4.5 Modify `apps/web/src/pages/HealthPage.tsx` (+ test): add `MANAGER` to `REVIEW_HISTORY_ROLES`; new sibling test asserting `hrefs === ['/review-history']` for ungranted manager too
- [ ] 4.6 Modify `apps/web/src/i18n/locales/{en,es,ca}.json`: `users.edit.capabilitiesLabel`, `users.edit.viewAllReviewsLabel`, `users.error.managerCapabilitiesNotAllowed`; update `locales.test.ts` parity
- [ ] 4.7 Verify `UserCreatePage.tsx` and its tests remain unmodified
- [ ] 4.8 Merge delta specs into `openspec/specs/{review-history,review-history-ui,authorization,user-management,user-admin-ui,review-session-management}/spec.md`
- [ ] 4.9 Update `docs/adr/ADR-011-*.md` addendum (Decision 2 first implementation, Decision 3 supersession) and `docs/requirements/functional-requirements.md` FR-008 status
- [ ] 4.10 Browser verification (CLAUDE.md): grant via edit page → reload persists → installation-wide list + drill-in incl. deactivated-community session; untick → next request empty, no re-login; ungranted manager sees empty state; regression pass other four roles
- [ ] 4.11 Verify: enum has exactly one member; no other ADR-011 capability name in `apps/**`/`packages/**`; no capability in JWT/token/`/auth/me`
