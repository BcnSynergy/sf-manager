# Tasks: Inspectable Elements per Community (FR-004)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2400-2800 (1 migration, 1 new API module across 4 layers, a 12-file `community` atomic-guard cluster incl. its own web mirror, 1 permission delta, 1 validation package, 3 new web pages + 1 nav-link, 3 locale files, full e2e coverage) |
| 400-line budget risk | High (as a single PR); each chained slice below stays under budget |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 -> PR 11 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|---|---|---|---|---|
| 1 | Prisma migration: `ElementType` enum + `InspectableElement` table + hand-written FK/index | PR 1 | ~120 | Mechanical, no behavior change; unblocks everything downstream |
| 2 | `inspectable-element` domain: entity, `ElementType` union, `installedAt` parse/format, not-found error | PR 2 | ~150 | Depends on PR 1 (types only); zero Prisma (ADR-013) |
| 3 | `community` atomic delete-guard cluster: counter port+adapter, deletion policy, domain error, `softDeleteById` → `Promise<boolean>` (Prisma + fake), use-case wiring, controller/error-code/module, web mirror | PR 3 | ~280 | Depends on PR 1 (table must exist for the counter/integration spec). Independently reviewable per design Decision 6 — genuine behavior change, ships as one unit |
| 4 | Authorization: extend `Permission`, grant `SYSTEM_ADMIN` row only | PR 4 | ~60 | Independent of PR 2/3 |
| 5 | `inspectable-element` application: port + 4 use cases + fake + shared Zod schema | PR 5 | ~260 | Depends on PR 2; needed by PR 6 |
| 6 | `inspectable-element` infra + presentation: Prisma repo, mapper, controller, DTOs, error-code, module wiring, `coded-error.ts` `NOT_FOUND` widening, migration/parity integration specs | PR 6 | ~320 | Depends on PR 4, PR 5 |
| 7 | Web: list + create pages, api client, error-messages, element-type labels, i18n, routes | PR 7 | ~340 | Depends on PR 6 |
| 8 | Web: edit page + route | PR 8 | ~150 | Depends on PR 7 |
| 9 | `CommunityDetailPage` nav-link to the community's elements | PR 9 | ~20 | Depends on PR 7 (route must exist to link to) |
| 10 | E2E: `inspectable-element.e2e-spec.ts` full lifecycle + RBAC; `community.e2e-spec.ts` delete-guard scenarios with real elements | PR 10 | ~350 | Depends on PR 6 (both modules wired) |
| 11 | Remaining scope-guard greps + full browser verification + final suite/lint/build | PR 11 | ~40 | Depends on PR 8, PR 9, PR 10 |

## Phase 1: Prisma Migration (PR 1) — mechanical, no TDD
- [x] 1.1 `apps/api/prisma/schema.prisma`: add `enum ElementType { EXTINGUISHER }` + `InspectableElement` model (`id`, `communityId`, `elementType`, `name`, `description?`, `location`, `serialNumber?`, `installedAt @db.Date`, `deletedAt?`) with `@@index([communityId])`; comment block flagging the Prisma-invisible FK (design File Changes; spec: inspectable-element-management "Create Inspectable Element Under a Community").
- [x] 1.2 Hand-written `migrations/<ts>_add_inspectable_element/migration.sql`: `CREATE TYPE`, `CREATE TABLE`, Prisma-visible `communityId` index, hand-written FK `ON DELETE RESTRICT ON UPDATE CASCADE` — mirror `20260825120000_add_community_and_assignments` (design "Interfaces" SQL block, Decision 3 for `DATE` not `TIMESTAMP(3)`).
- [x] 1.3 Apply the migration in dev; confirm `prisma migrate dev --create-only` does not emit `DropForeignKey` for any of the 5 existing `@relation`-less FKs (delete any it emits, per design's Open Questions warning); regenerate the Prisma client.

## Phase 2: Inspectable Element Domain (PR 2) — Strict TDD
- [x] 2.1 RED/GREEN `domain/element-type.ts` — `ELEMENT_TYPES` const array + `ElementType` union, `satisfies readonly ValidatedElementType[]` (design Decision 1). **Deviation**: the `satisfies readonly ValidatedElementType[]` gate against `@sf-manager/validation` could not be wired — that package does not export an `ElementType` type until Phase 5 (task 5.7). The union is declared standalone with a comment documenting the deferred gate; Phase 5 closes this edge.
- [x] 2.2 RED/GREEN `domain/inspectable-element.entity.ts` — plain fields, zero Prisma (ADR-013), no constructor validation (design Decision 2; spec: "Entity shape" in Purpose).
- [x] 2.3 RED/GREEN `domain/installed-at.ts` — `parseInstalledAt`/`formatInstalledAt` round-trip, incl. a DST-boundary date and a UTC-offset-sensitive one (design Decision 3).
- [x] 2.4 `domain/errors/inspectable-element-not-found.error.ts` — mirrors `MaintenanceCompanyNotFoundError` (mechanical).

## Phase 3: Community Atomic Delete-Guard Cluster (PR 3) — Strict TDD, independently reviewable unit
- [x] 3.1 RED/GREEN `community/domain/community-deletion.policy.ts` — `assertNoActiveElementsAttached(count)`, table-driven 0/1/n (design Decision 6; spec: community-management "Soft-Delete Community").
- [x] 3.2 `community/domain/errors/community-has-active-elements.error.ts` — carries `activeElementCount`, mirrors `MaintenanceCompanyHasActiveUsersError` (mechanical).
- [x] 3.3 `community/application/ports/inspectable-element-counter.port.ts` — `countActiveByCommunity(communityId)` + `INSPECTABLE_ELEMENT_COUNTER` token, owned by `community` — keeps the DI graph acyclic, no `forwardRef()` (design Decision 4).
- [x] 3.4 RED/GREEN `community/infrastructure/persistence/prisma-inspectable-element-counter.repository.ts` — `prisma.inspectableElement.count({ where: { communityId, deletedAt: null } })` via `@Global()` `PrismaModule`; integration spec against real Postgres.
- [x] 3.5 `community/application/ports/community.repository.port.ts` — `softDeleteById(): Promise<boolean>` + doc comment on the atomic guarantee (mechanical signature change, design Decision 6).
- [x] 3.6 RED/GREEN `community/infrastructure/persistence/prisma-community.repository.ts` — `softDeleteById` becomes the atomic `UPDATE ... WHERE ... AND NOT EXISTS (active element)` raw SQL; integration spec asserts `false` returned with an active element present, inserted directly via Prisma (no `inspectable-element` module required).
- [x] 3.7 `community/application/use-cases/testing/in-memory-community.repository.ts` — fake reproduces the boolean contract, exercised by 3.8's use-case spec.
- [x] 3.8 RED/GREEN `community/application/use-cases/soft-delete-community.use-case.ts` — `findById` → `countActiveByCommunity` (fast path) → `assertNoActiveElementsAttached` → `softDeleteById`; on `false`, re-check via `findById` (404) or `CommunityHasActiveElementsError`; representative-deactivation cascade gated on `wasDeleted === true` (design Data Flow "DELETE /communities/:id"; spec scenarios "Delete refused while an active element is attached", "Soft-deleted elements do not block deletion", "Delete succeeds after soft-deleting every active element").
- [x] 3.9 `community/presentation/community.controller.ts` — one new `mapMutationError` branch (`CommunityHasActiveElementsError` → 409) + `@ApiConflictResponse` on `DELETE` (mechanical, design Decision 7).
- [x] 3.10 `community/presentation/community-error-code.ts` — `+ COMMUNITY_HAS_ACTIVE_ELEMENTS` (mechanical).
- [x] 3.11 `community/community.module.ts` — bind `INSPECTABLE_ELEMENT_COUNTER`; imports nothing new (mechanical).
- [x] 3.12 Web mirror (design Finding 4): `apps/web/src/api/community.ts` — `CommunityErrorCode` gains `COMMUNITY_HAS_ACTIVE_ELEMENTS`; `apps/web/src/community/error-messages.ts` — new key forced by `Record<CommunityErrorCode, string>`; `i18n/locales/{en,es,ca}.json` — real `community.error.hasActiveElements` translations. `CommunitiesListPage.tsx` itself needs zero changes.

## Phase 4: Authorization (PR 4) — mechanical + spec extension
- [x] 4.1 `shared/application/authorization/permission.ts` — add `inspectableElement:create|read|update|delete` (spec: authorization "Permission Check on Inspectable Element Endpoints").
- [x] 4.2 RED/GREEN `role-permission.checker.ts` spec — extend the existing exhaustive `ALL_PERMISSIONS x NON_ADMIN_ROLES` table with the 4 new permissions; `SYSTEM_ADMIN` gets all 4, the other 4 roles stay `[]`.

## Phase 5: Inspectable Element Application (PR 5) — Strict TDD
- [x] 5.1 `application/ports/inspectable-element.repository.port.ts` — `Symbol` token; `create`/`findByIdInCommunity`/`findAllByCommunity`/`updateById`/`softDeleteById`. **No** `countActiveByCommunity` (design Decision 4), **no** `transactional()` (mechanical interface).
- [x] 5.2 RED/GREEN `create-inspectable-element.use-case.ts` — parent guard (`communityRepository.findById`) before any write; assert `create()` never called on guard failure (spec: "Create Inspectable Element Under a Community", "Non-existent/Soft-deleted community rejected").
- [x] 5.3 RED/GREEN `list-inspectable-elements-by-community.use-case.ts` — parent guard; excludes soft-deleted (spec: "List Elements By Community").
- [x] 5.4 RED/GREEN `update-inspectable-element.use-case.ts` — parent guard then `findByIdInCommunity`; never mutates `communityId`/`elementType` (spec: "Update Inspectable Element").
- [x] 5.5 RED/GREEN `soft-delete-inspectable-element.use-case.ts` — parent guard then `findByIdInCommunity`; community check strictly precedes element check (spec: "Soft-Delete Inspectable Element"; design Decision 5 ordering rule).
- [x] 5.6 `application/use-cases/testing/in-memory-inspectable-element.repository.ts` — fake reproduces community scoping: wrong-community, unknown, and soft-deleted ids all resolve to `null` via `findByIdInCommunity`.
- [x] 5.7 `packages/validation/src/inspectable-element/inspectable-element.schema.ts` + `src/index.ts` — `elementTypeSchema`, `createInspectableElementSchema`, `updateInspectableElementSchema` (`z.iso.date()`, trim, `.nullable()` on update for `description`/`serialNumber`). Mechanical, no dedicated RED/GREEN — package has no test harness (precedent: `maintenance-company` Phase 6.3). **Also closed the Phase 2 deferred gate**: `domain/element-type.ts` now imports `ElementType as ValidatedElementType` from `@sf-manager/validation` and wires `as const satisfies readonly ValidatedElementType[]` (design Decision 1).

## Phase 6: Inspectable Element Infrastructure + Presentation (PR 6) — mechanical + integration specs
- [x] 6.1 `infrastructure/persistence/prisma-inspectable-element.repository.ts` (extends `SoftDeletableRepository`) + `inspectable-element.mapper.ts` — direct-assignment `elementType` mapping, no cast, no switch (design Decision 1).
- [x] 6.2 Integration: `infrastructure/persistence/element-type-parity.integration.spec.ts` — asserts `[...ELEMENT_TYPES]`, `Object.values($Enums.ElementType)`, and `[...elementTypeSchema.options]` all agree when sorted.
- [x] 6.3 Integration: migration guard spec — hand-written FK present in `pg_constraint` (`ON DELETE RESTRICT`), `communityId` index in `pg_indexes`, the 5 pre-existing FKs still survive, `installedAt` column type is `date`.
- [x] 6.4 `presentation/inspectable-element.controller.ts` + `dto/**` + Swagger — 4 routes nested under `communities/:communityId/inspectable-elements`, ordering-rationale comment (design Decision 8); uses `buildCodedError`.
- [x] 6.5 `presentation/inspectable-element-error-code.ts` — exactly 2 values (`COMMUNITY_NOT_FOUND`, `INSPECTABLE_ELEMENT_NOT_FOUND`).
- [x] 6.6 `shared/presentation/http/coded-error.ts` — widen `CodedErrorStatus` with `NOT_FOUND: 'Not Found'` (design Decision 7, reported finding, additive-only, already covered by `coded-error.spec.ts`).
- [x] 6.7 `inspectable-element.module.ts` — imports `CommunityModule` for `COMMUNITY_REPOSITORY` (design Decision 4); register in `app.module.ts`.

## Phase 7: Web — List + Create (PR 7) — mechanical + component tests
- [x] 7.1 `apps/web/src/api/inspectable-element.ts` — typed calls + mirrored `InspectableElementErrorCode`.
- [x] 7.2 `apps/web/src/inspectable-element/error-messages.ts` — status/code-only map, mirrors `community/error-messages.ts` (spec: "No Server-Message String Coupling").
- [x] 7.3 `apps/web/src/inspectable-element/element-type-labels.ts` — `Record<ElementType, string>` label map; a missing entry is a compile error (spec: "Element Type Label Mapping").
- [x] 7.4 `apps/web/src/pages/CommunityElementsListPage.tsx` — clones `MaintenanceCompaniesListPage.tsx`; loading/empty/error states; element type rendered via label map, never raw `EXTINGUISHER` (spec: "List Active Elements For a Community").
- [x] 7.5 `apps/web/src/pages/InspectableElementCreatePage.tsx` — clones `MaintenanceCompanyCreatePage.tsx`; client validation via the shared schema before any network call (spec: "Create Inspectable Element").
- [x] 7.6 `apps/web/src/App.tsx` — list + create nested routes under `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`, static-before-dynamic ordering comment (design Decision 8).
- [x] 7.7 `i18n/locales/{en,es,ca}.json` — real `inspectableElement.*` keys (list/create/labels); extend `locales.test.ts` parity guard (spec: "Internationalization Coverage").

## Phase 8: Web — Edit (PR 8)
- [ ] 8.1 `apps/web/src/pages/InspectableElementEditPage.tsx` — inlined list-and-select (`listInspectableElements` then `.find`), prefilled form, confirmed soft-delete via `ConfirmDialog`, 4 load states (`loading|loaded|not-found|error`) (design Decision 9; spec: "Edit Inspectable Element", "Soft-Delete Inspectable Element").
- [ ] 8.2 `apps/web/src/App.tsx` — edit route (`/communities/:communityId/inspectable-elements/:elementId/edit`), static-before-dynamic ordering preserved.

## Phase 9: Community Nav-Link (PR 9)
- [ ] 9.1 `apps/web/src/pages/CommunityDetailPage.tsx` — one `<Link>` to the community's inspectable elements, its only sanctioned change (spec: community-admin-ui "Navigation to Inspectable Elements").

## Phase 10: E2E — Inspectable Element CRUD, Community Delete-Guard, RBAC (PR 10)
- [ ] 10.1 `apps/api/test/inspectable-element.e2e-spec.ts` — full lifecycle (create/list/update/delete); element under A never listed under B; create under unknown/soft-deleted community → 404 `COMMUNITY_NOT_FOUND`, no row written; PATCH/DELETE cross-community → 404 `INSPECTABLE_ELEMENT_NOT_FOUND`; two identical name+location accepted; duplicate/absent `serialNumber` accepted; soft-deleted element absent from list.
- [ ] 10.2 `apps/api/test/inspectable-element.e2e-spec.ts` — RBAC matrix: 401 unauthenticated / 403 non-admin on all 4 routes; the four non-admin `ROLE_PERMISSIONS` rows still `[]` (spec: authorization).
- [ ] 10.3 `apps/api/test/community.e2e-spec.ts` — community delete blocked ⇒ 409 `COMMUNITY_HAS_ACTIVE_ELEMENTS` via a real created element, `deletedAt` stays `null`, no element modified; delete succeeds after soft-deleting every active element; delete succeeds with only soft-deleted elements present (spec: community-management "Soft-Delete Community").

## Phase 11: Remaining Deltas + Browser Verification + Final Checks (PR 11)
- [ ] 11.1 Grep-confirm no `code`, `imageUrl`, `active`, `lastHydrostaticTestAt`, or `hydrostaticTestCount` column, field, or form input exists anywhere (proposal Success Criteria scope guard).
- [ ] 11.2 Browser verification (`npm run dev`, `claude-in-chrome`, `SYSTEM_ADMIN` session): create/list/edit/soft-delete an element; blocked-community-delete message; `installedAt` round-trips the same day in a non-UTC browser; non-admin `NotAuthorized` surface (not a redirect); es/ca locale spot-check (CLAUDE.md "Verifying UI Changes").
- [ ] 11.3 Full API + web suites, lint, build all pass; `no-restricted-imports` passes; grep confirms no stray `code`/QR/typed-detail artifact exists.

## Rules Applied
- Strict TDD: RED/GREEN on all logic-bearing files (entities, policies, use cases, mappers where non-trivial, guards); migrations/DTOs/module wiring/schema files/error-code enums are mechanical, no RED/GREEN required.
- Phase 1 (migration) is isolated and mechanical, mirroring the `maintenance-company` chain's PR2 precedent — no business logic in the same PR.
- Phase 3 (community atomic delete-guard cluster) ships as one unit per design Decision 6: it is a genuine behavior change (today's soft-delete is unconditional), so the port signature, Prisma adapter, in-memory fake, policy, error, and use-case guard all land together, not split across PRs.
- Design Decisions 1-9 (ElementType three-way seam, no Value Objects, `DATE` not `TIMESTAMP(3)`, DI-cycle-free counter port, community-scoped read, atomic delete guard, coded 404s, nested routes, distinct list route) are settled — do not re-litigate at apply time.
- Do not re-open any Settled product decision from the proposal (SYSTEM_ADMIN-only access, no `code`/`imageUrl`/typed details/hydrostatic tracking, block-only community delete guard, informational `serialNumber`).
- `apps/api/src/shared/presentation/http/coded-error.ts`'s `NOT_FOUND` widening (Phase 6.6) is additive and safe to land independently if the chain is re-split.
