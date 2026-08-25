# Tasks: Community + Representative/Technician Assignments

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2500-3300 (3 entities, 5 errors, 1 policy, 3 ports, 10 use cases, 3 in-memory fakes, 3 Prisma adapters+mappers, controller+DTOs, migration, validation schemas, E2E) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR11 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Schema/migration: `Community`, `Locale` enum, both assignment tables + hand-written partial unique index | PR 1 | No behavior change; unblocks everything |
| 2 | Domain: 3 entities, eligibility policy, 5 errors | PR 2 | Depends on PR 1 (types only); zero Prisma (ADR-013) |
| 3 | Authorization: extend `Permission`, grant `SYSTEM_ADMIN` row only | PR 3 | Independent of PR 2; small |
| 4 | Community application: port + 4 CRUD use cases + fake | PR 4 | Depends on PR 2 |
| 5 | Community infra+presentation: Prisma adapter, controller CRUD, DTOs, module wiring, validation schemas | PR 5 | Depends on PR 3, PR 4 |
| 6 | Representative application: port (w/ `transactional`) + 3 use cases + fake w/ snapshot rollback | PR 6 | Depends on PR 2 |
| 7 | Soft-delete cascade: extend `SoftDeleteCommunityUseCase` using representative port | PR 7 | Depends on PR 5, PR 6; unit-tested via fakes only |
| 8 | Representative infra+presentation: Prisma adapter (SERIALIZABLE), controller routes, DTOs | PR 8 | Depends on PR 6; parallel to PR 9 |
| 9 | Technician application+infra+presentation: port + 3 use cases + fake + adapter + controller routes | PR 9 | Depends on PR 2, PR 5; parallel to PR 8 |
| 10 | List assignments: `GET .../representatives`, `GET .../technicians` | PR 10 | Depends on PR 8, PR 9 |
| 11 | E2E suite | PR 11 | Depends on all prior units |

## Phase 1: Schema & Migration (PR 1)
- [x] 1.1 `schema.prisma`: add `Community`, `enum Locale {en es ca}`, `CommunityRepresentative`, `CommunityTechnician` (`@@unique([communityId,userId])` on both).
- [x] 1.2 Hand-written migration SQL: create tables + hand-written partial unique index `CommunityRepresentative_one_active_per_community` (`WHERE "deactivatedAt" IS NULL`); comment warning against `prisma migrate dev` regeneration.
- [x] 1.3 Verify migration applies cleanly in dev.

## Phase 2: Domain Layer (PR 2)
- [x] 2.1 RED/GREEN `community.entity.ts`/`.spec.ts` — hand-written, zero Prisma (ADR-013).
- [x] 2.2 RED/GREEN `community-representative.entity.ts`/`.spec.ts`.
- [x] 2.3 RED/GREEN `community-technician.entity.ts`/`.spec.ts`.
- [x] 2.4 RED/GREEN `assignment-eligibility.policy.ts`/`.spec.ts` — `assertEligibleFor(role, kind)`, table-driven over roles × kind.
- [x] 2.5 `domain/errors/{community-not-found,assignment-not-found,assignment-already-exists,ineligible-role,transaction-conflict}.error.ts`.

## Phase 3: Authorization (PR 3)
- [ ] 3.1 `shared/application/authorization/permission.ts` — add `community:create|read|update|delete|assign`.
- [ ] 3.2 RED/GREEN `role-permission.checker.ts` spec — `SYSTEM_ADMIN` gets all 5 community permissions; other 4 roles stay `[]`.

## Phase 4: Community Application (PR 4)
- [ ] 4.1 `community.repository.port.ts` — `Symbol` token; `create`/`findById`/`findAll`/`updateById`/`softDeleteById`.
- [ ] 4.2 RED/GREEN `create-community.use-case.ts`.
- [ ] 4.3 RED/GREEN `list-communities.use-case.ts` — excludes soft-deleted.
- [ ] 4.4 RED/GREEN `update-community.use-case.ts` — 404 on missing id.
- [ ] 4.5 RED/GREEN `soft-delete-community.use-case.ts` — sets `deletedAt` only (cascade added Phase 7).
- [ ] 4.6 `in-memory-community.repository.ts` fake — `deletedAt: null` default filter parity.

## Phase 5: Community Infra & Presentation (PR 5)
- [ ] 5.1 `prisma-community.repository.ts` (extends `SoftDeletableRepository`) + `community.mapper.ts`.
- [ ] 5.2 Integration: `findAll`/`findById` exclude soft-deleted (real Postgres).
- [ ] 5.3 `packages/validation/src/community/community.schema.ts` (create/update) + `src/index.ts` export.
- [ ] 5.4 `community.controller.ts` CRUD routes + `dto/**` + Swagger + domain-error→HTTP mapping.
- [ ] 5.5 `community.module.ts` providers/controller; register in `app.module.ts`.

## Phase 6: Representative Application (PR 6)
- [ ] 6.1 `community-representative.repository.port.ts` — `Symbol` token; `transactional()` only here.
- [ ] 6.2 RED/GREEN `add-representative.use-case.ts` — eligibility gate; 409 `AssignmentAlreadyExistsError` if pair exists.
- [ ] 6.3 RED/GREEN `deactivate-representative.use-case.ts`.
- [ ] 6.4 RED/GREEN `reactivate-representative.use-case.ts` — exclusivity swap inside `transactional()`; rejects soft-deleted user (404 via `findById`).
- [ ] 6.5 Cover multi-community warning (`countActiveByUser > 1`) in 6.2/6.4 specs; no-warning first-activation case.
- [ ] 6.6 `in-memory-community-representative.repository.ts` fake — snapshot/rollback `transactional()`, invariant parity.

## Phase 7: Soft-Delete Cascade (PR 7)
- [ ] 7.1 Extend `soft-delete-community.use-case.ts`: `findActiveByCommunity` → `countActiveByUser` → `setDeactivatedAt` when `==1`, no-op when `>1`.
- [ ] 7.2 RED/GREEN unit tests: sole-community rep deactivated / active-elsewhere untouched / already-inactive record untouched / technicians unaffected.

## Phase 8: Representative Infra & Presentation (PR 8)
- [ ] 8.1 `prisma-community-representative.repository.ts` — `transactional()` via `$transaction(SERIALIZABLE)`, `P2034`→`TransactionConflictError`; mapper.
- [ ] 8.2 Integration: `SERIALIZABLE` conflict→409; partial index present in `pg_indexes`; concurrent double-activation leaves exactly one active.
- [ ] 8.3 Controller routes: `POST`/`DELETE`/`POST .../reactivate` under `.../representatives` + DTOs (warning payload) + Swagger.

## Phase 9: Technician Application, Infra & Presentation (PR 9)
- [ ] 9.1 `community-technician.repository.port.ts` — no `transactional`, no `countActiveByUser`.
- [ ] 9.2 RED/GREEN `add-technician.use-case.ts` — eligibility gate only, no exclusivity.
- [ ] 9.3 RED/GREEN `deactivate-technician.use-case.ts` / `reactivate-technician.use-case.ts`.
- [ ] 9.4 `in-memory-community-technician.repository.ts` fake.
- [ ] 9.5 `prisma-community-technician.repository.ts` + mapper; integration: no exclusivity enforced.
- [ ] 9.6 Controller routes: `POST`/`DELETE`/`POST .../reactivate` under `.../technicians` + DTOs (no warning field).

## Phase 10: List Assignments (PR 10)
- [ ] 10.1 `GET .../:id/representatives` and `GET .../:id/technicians` — controller composes `listByCommunity()` directly (active + deactivated), no dedicated use case (per design's 10-use-case count).
- [ ] 10.2 Test: response includes both active and deactivated records.

## Phase 11: E2E Suite (PR 11)
- [ ] 11.1 `community.e2e-spec.ts` — CRUD happy paths.
- [ ] 11.2 E2E: soft-delete cascade — sole-community rep deactivated vs. active-elsewhere untouched.
- [ ] 11.3 E2E: eligibility rejection (wrong role) for representative and technician adds.
- [ ] 11.4 E2E: exclusivity swap + reactivation + multi-community warning present/absent.
- [ ] 11.5 E2E: reactivation rejected for a soft-deleted user (rep and technician).
- [ ] 11.6 E2E: accepted eligibility drift — role change via `/users` leaves assignment untouched.
- [ ] 11.7 E2E: 401 unauth / 403 non-admin on every `/communities` route; `ROLE_PERMISSIONS` non-admin rows still `[]`.
- [ ] 11.8 E2E: multiple technicians active in same community + same technician active across communities, no warning.

## Rules Applied
- Strict TDD: RED/GREEN pairs on all logic-bearing files (entities, policy, use cases, mappers, guards); migrations/DTOs/module wiring are mechanical, no RED/GREEN needed.
- Two-tables decision, `deactivatedAt` (not `deletedAt`) on assignments, and route shapes follow `design.md` Decisions 1-4 verbatim — do not re-litigate at apply time.
- Soft-delete cascade (Phase 7) implements the settled rule from the revised `community-management`/`community-assignments` specs: reuse `countActiveByUser`, no new port method, no new error.
