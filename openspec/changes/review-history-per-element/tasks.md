# Tasks: Per-Element Review History

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~250-350, PR2 ~350-450, PR3 ~350-450 (~950-1250 total) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR2 -> PR3 (stacked-to-main) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Port + Prisma adapter + fake + index migration + repo integration tests | PR 1 | base `main`; independent, revertable |
| 2 | Access-service branches + use case + route/DTO + unit + E2E matrix | PR 2 | base = PR1 branch; depends on PR1 |
| 3 | Web page + entry links + i18n + spec merges + FR-008 close + browser verify | PR 3 | base = PR2 branch; depends on PR2 |

## Phase 1: Data Access (PR 1) — `review-history-per-element/01-port-adapter-migration`

- [x] 1.1 `schema.prisma`: add `@@index([inspectableElementId])` on `ElementReviewEntry` (Decision 3), single-column
- [x] 1.2 Hand-write migration `..._add_element_review_entry_inspectable_element_index/migration.sql`
- [x] 1.3 Port: add `ElementReviewEntryRow` + 4 `findCompletedEntriesForElement{ForPerformer,InCommunities,ForCompany,AcrossInstallation}` methods to `review-session.repository.port.ts`; extend "no identifier-only read" note
- [x] 1.4 Adapter: implement all 4 as entry-first two-query joins (Decision 2) + `ELEMENT_HISTORY_ORDER_BY` constant in `prisma-review-session.repository.ts`
- [x] 1.5 In-memory fake: mirror all 4 methods incl. `communityIds: []` false-predicate case
- [x] 1.5a Follow-up (fresh-context review, non-blocking WARNING): add dedicated unit-test coverage for the 4 fake methods in `in-memory-review-session.repository.spec.ts` — happy path, `InCommunities` fail-closed empty scope, draft exclusion, sibling-element exclusion (commit `fe03a26`)
- [x] 1.6 Update `find*` enumeration guard test with the 4 new names; confirm `…AcrossInstallation` call-site regex still excludes the new name
- [x] 1.7 Integration tests (real Postgres): 2 performers/2 companies/1 element, draft session excluded, sibling-element entry excluded; index-existence + rollback (`DROP INDEX`) test; `reviewed` derivation test — written against real Postgres schema/queries but UNEXECUTED in this environment (no reachable Postgres instance; confirmed pre-existing/environmental, not a code issue — see apply-progress)

## Phase 2: Authorization, Use Case, Route (PR 2) — `.../02-access-use-case-route`

- [x] 2.1 `review-history-access.service.ts`: add `ElementHistoryScope` discriminated union + `listElementHistoryForActor` + private per-role dispatcher (Decision 4); `listForActor`/`loadByRole` untouched
- [x] 2.2 Create `read-element-review-history.use-case.ts`: element-first lookup via `findByIdInCommunity`, one throw site `InspectableElementNotFoundError`, header + `communityName`/`performedByEmail` batched lookups, `reviewed` derivation, sort (Decision 5)
- [x] 2.3 Create `element-review-history-response.dto.ts`
- [x] 2.4 `review-history.controller.ts`: add `GET :communityId/inspectable-elements/:elementId/review-history` with `@RequirePermission('reviewSession:read')`; add `mapError` branch
- [x] 2.5 Wire use case in `review-session.module.ts` (no new imports)
- [x] 2.6 Unit tests: access-service table-driven over 5 roles incl. `not.toHaveBeenCalled()` fail-closed cases; use-case call-order/throw-site tests
- [x] 2.7 E2E: five-scope matrix + 404-vs-empty matrix + scope guards (`ROLE_PERMISSIONS` unchanged, no `inspectableElement:read` gain, no new element port method, no list-control params)

## Phase 3: Web UI + Docs (PR 3) — `.../03-web-ui-i18n-docs`

- [ ] 3.1 Add `readElementReviewHistory` to `apps/web/src/api/review-history.ts`
- [ ] 3.2 Create `ElementReviewHistoryPage.tsx` (+ test): header, rows, loading/empty/error states, links to `/review-history/:sessionId`
- [ ] 3.3 `App.tsx`: add five-role route + in-file anomaly comment; `ProtectedRoute.test.tsx`: assert 5 roles here + admin-only on sibling routes
- [ ] 3.4 `CommunityElementsListPage.tsx` (+ test): per-row History link
- [ ] 3.5 `ReviewHistoryDetailPage.tsx` (+ test): per-entry element-history link
- [ ] 3.6 `i18n/locales/{en,es,ca}.json`: real translations; run parity test
- [ ] 3.7 Merge delta specs into `openspec/specs/{review-history,review-history-ui,authorization,review-session-management,inspectable-element-admin-ui}/spec.md`
- [ ] 3.8 Close FR-008 in `docs/requirements/functional-requirements.md`
- [ ] 3.9 Browser verification (CLAUDE.md): dev server, admin + technician golden paths + empty/decommissioned states
