# Tasks: View Review History

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1500-1800 (1 Layer-2 port method + adapter, 4 repository methods x2 adapters, 1 new sibling access service, 2 use cases, 1 new controller + 2 DTOs, module wiring, 2 new web pages + entry-point link + routing, 3 locale files, full e2e visibility matrix, 2 spec-guard narrowings, no migration) |
| 400-line budget risk | High (as a single PR); each chained slice below stays near/under budget |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 -> PR 4 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|---|---|---|---|---|
| 1 | Read-side foundation: `listAssignedCommunityIds` (Layer 2) + all 4 `findCompleted…` repo methods (Prisma + in-memory fake) + `ReviewHistoryAccessService.listForActor` + `ListReviewHistoryUseCase` + `GET /review-history` | PR 1 | ~500 | Independently shippable; no dependency on later units |
| 2 | Detail read: `loadCompletedForActor` + `ReadReviewHistoryUseCase` (frozen questions + live element code) + `GET /review-history/:sessionId` + full E2E visibility matrix | PR 2 | ~450 | Depends on PR 1's port/adapter/service scaffolding |
| 3 | Web: api client, `ReviewHistoryPage`, `ReviewHistoryDetailPage`, routes, entry-point link, i18n (en/es/ca) | PR 3 | ~450 | Depends on PR 2 (needs the full API surface) |
| 4 | Spec-guard narrowing (`review-session-management`, `review-session-ui`), docs, browser verification, final checks | PR 4 | ~150 | Depends on PR 3 |

## Phase 1: Layer 2 — Active Community Scope Listing (PR 1)
- [x] 1.1 RED/GREEN `apps/api/src/shared/application/authorization/community-scope.checker.port.ts` — add `listAssignedCommunityIds(userId, role): Promise<string[]>`; `isAssignedTo` untouched (design Decision 2).
- [x] 1.2 RED/GREEN `.../community/infrastructure/authorization/assignment-community-scope.checker.ts` — implement with the same fail-closed exhaustive `switch` (`role satisfies never` default), dispatching to `technicianRepository.findActiveByUser` / `representativeRepository.findActiveByUser`; every other role returns `[]`.
- [x] 1.3 Unit: table-driven over all 5 roles x {no row, deactivated row, active rows} — deactivated rows never appear, non-operational roles always `[]` (spec: authorization "Resource Scope for Review History Reads").

## Phase 2: Repository Ports + Adapters (PR 1)
- [x] 2.1 RED/GREEN `.../review-session/application/ports/review-session.repository.port.ts` — add `findCompletedForPerformerInCommunities`, `findCompletedInCommunities`, `findCompletedByIdForPerformerInCommunities`, `findCompletedByIdInCommunities` (design Decision 3); confirm still no bare `findById`.
- [x] 2.2 RED/GREEN `.../review-session/infrastructure/persistence/prisma-review-session.repository.ts` — implement all 4; `status = 'completed'` + community `IN` (+ performer `=` for the two performer-scoped ones); shared `completedAt DESC, id DESC` ordering constant used by both list methods.
- [x] 2.3 RED/GREEN `.../review-session/application/use-cases/testing/in-memory-review-session.repository.ts` — same 4 methods, same ordering, same empty-scope behaviour.
- [x] 2.4 Unit (fake) + Integration (Prisma): `communityIds = []` yields an empty list / `null` for all 4 methods — the fail-closed empty-scope case, asserted against both adapters.
- [x] 2.5 Integration: enumerate `ReviewSessionRepository`'s methods — none returns a session/list from an identifier alone without a performer or community scope (spec: "No unscoped session read exists").
- [x] 2.6 Integration: ordering parity — both list methods return `completedAt DESC, id DESC`, identical direction, deterministic on equal timestamps.

## Phase 3: List Access + Use Case + Route (PR 1)
- [x] 3.1 RED/GREEN `.../review-session/application/services/review-history-access.service.ts` — create `ReviewHistoryAccessService.listForActor(actor)`: `listAssignedCommunityIds` -> `[]` short-circuits to empty; exhaustive role `switch` dispatching to the two list repo methods (design Decision 1).
- [x] 3.2 Unit: role dispatch — technician hits `ForPerformer`, representative hits the community method, every other role reaches no repository call and yields `[]`.
- [x] 3.3 Unit: `SessionAccessService`'s existing suite passes **unmodified** (proof the sibling service changed nothing on the write path).
- [x] 3.4 RED/GREEN `.../review-session/application/use-cases/list-review-history.use-case.ts` — calls `listForActor`, resolves `communityName` via `CommunityRepository.findById` once per scope community, maps to `ReviewHistoryRowDto[]` ordered as returned.
- [x] 3.5 `.../review-session/presentation/dto/review-history-row.dto.ts` — `{ id, communityId, communityName, performedById, startedAt, completedAt }`.
- [x] 3.6 `.../review-session/presentation/review-history.controller.ts` — create; `GET /review-history` with `@RequirePermission('reviewSession:read')`; own 3-line `mapError`. (`mapError` deferred to PR 2 — the list route throws no mapped error yet; adding a dead/unused method now would be premature. Noted as a deviation below.)
- [x] 3.7 `.../review-session/review-session.module.ts` — register controller, service, use case.
- [x] 3.8 E2E: own-history list scenarios (own sessions only, another performer's never appears, empty history is 2xx empty list); representative community list scenarios (sees non-performed session, another community never appears, multi-community flat list); drafts excluded from both lists.

## Phase 4: Detail Read (PR 2)
- [x] 4.1 RED/GREEN `review-history-access.service.ts` — add `loadCompletedForActor(sessionId, actor)`: exhaustive role `switch` to the two by-id repo methods; `null` -> `ReviewSessionNotFoundError` (one throw site, one mapping).
- [x] 4.2 Unit: unknown / draft / foreign performer / foreign community / deactivated assignment all collapse to the same `ReviewSessionNotFoundError` path.
- [x] 4.3 RED/GREEN `.../review-session/application/use-cases/read-review-history.use-case.ts` — calls `loadCompletedForActor`, then `ReviewTemplateRepository.findFrozenWithSnapshot(templateId)` for frozen wording, then `InspectableElementRepository.findActiveByCommunityAndType` for live `elementCode` (nullable) per entry.
- [x] 4.4 Unit: a decommissioned/soft-deleted element yields `elementCode: null` on its entry rather than dropping the entry; answer stays paired with snapshotted wording after live question-pool edits.
- [x] 4.5 `.../review-session/presentation/dto/review-history-detail-response.dto.ts` — superset of `ReviewSessionDetailResponseDto` + `questions: TemplateQuestionEntry[]`, `elementCode: string | null` per entry.
- [x] 4.6 `review-history.controller.ts` — add `GET /review-history/:sessionId`.
- [x] 4.7 E2E: performer reads own record back in full (incl. unreviewed reason); representative reads a technician-performed session identically; each entry carries element identity; decommissioned element entry still returned with `elementCode: null`.
- [x] 4.8 E2E: indistinguishable 404 — deep-equal status/code/body for unknown id, another performer's, another community's; no distinct "exists but not yours" error code.
- [x] 4.9 E2E: retroactive revocation — technician reads own session, assignment deactivated, identical request now absent from list **and** 404 by id, on the very next request; same for representative community access; access returns once reassigned.
- [x] 4.10 E2E: scope guards — `MANAGER`/`MAINTENANCE_COMPANY_MANAGER` still `[]`, `SYSTEM_ADMIN` 403 on both routes; no `ManagerCapability`; no page/cursor/limit/offset/date-range/sort/search parameter accepted; no new migration; no mutating operation among the added routes/use cases/port methods.

## Phase 5: Web — List + Detail (PR 3)
- [ ] 5.1 `apps/web/src/api/review-history.ts` — `apiFetch` client + response types mirroring `review-session.ts`.
- [ ] 5.2 RED/GREEN `apps/web/src/pages/ReviewHistoryPage.tsx` (+ test) — single `LoadState`, flat table (community, completed at, open link), zero client-side filtering, localized empty state, distinct loading/error states.
- [ ] 5.3 RED/GREEN `apps/web/src/pages/ReviewHistoryDetailPage.tsx` (+ test) — fork, not reuse, of `ReviewSessionDetailPage.tsx`; renders entries/answers/observations + snapshotted question wording; neutral localized label when `elementCode` is `null`; test asserts **no** mutation control renders (no edit/reopen/answer/mark-unreviewed/code-entry/complete/discard/sign/export/delete).
- [ ] 5.4 `apps/web/src/App.tsx` — `/review-history` and `/review-history/:sessionId` routes under `ProtectedRoute allowedRoles={['MAINTENANCE_TECHNICIAN','COMMUNITY_REPRESENTATIVE']}`.
- [ ] 5.5 `apps/web/src/pages/ReviewSessionsPage.tsx` — add a `Link` entry point to `/review-history`.
- [ ] 5.6 Unit: another role sees explicit "not authorized"; unauthenticated redirected to `/login`; unreachable-session message identical across nonexistent/foreign-performer/foreign-community/draft, selected only via `ApiError.status`/`.code`.
- [ ] 5.7 `apps/web/src/i18n/locales/{en,es,ca}.json` — real translations for all new keys (list, detail, empty state, unreachable message, neutral element label); extend `locales.test.ts` parity coverage.

## Phase 6: Spec Guards, Docs, Verification (PR 4)
- [ ] 6.1 `openspec/specs/review-session-management/spec.md` — apply the delta: narrow "Adjacent Review Capabilities Are Not Introduced" per-performer/per-community rows to deferred-only (company/global visibility, per-element filtering); keep FR-009/FR-010 rows intact.
- [ ] 6.2 `openspec/specs/review-session-ui/spec.md` — apply the delta: narrow "No Offline, History or Scheduling Surface" the same way; keep the rest intact.
- [ ] 6.3 Merge `openspec/changes/review-history/specs/{authorization,review-history,review-history-ui}/spec.md` deltas into `openspec/specs/` as new/modified capability files.
- [ ] 6.4 Run full suites: `npm run test --workspace=apps/api`, `npm run test:integration --workspace=apps/api`, `npm run test:e2e --workspace=apps/api`, `npm run test --workspace=apps/web`, `npm run lint`, `npm run build`.
- [ ] 6.5 Browser verification (CLAUDE.md) against a running dev server: log in as `MAINTENANCE_TECHNICIAN` — own history list + drill-in; log in as `COMMUNITY_REPRESENTATIVE` — cross-performer history + drill-in, multi-community row labeling if seeded; deactivate an assignment and re-load to confirm loss of access; empty-state render.
- [ ] 6.6 Note the deferred ADR-011 addendum (design Open Questions — two access services) and the performer-identity / live-element-code gaps as explicit follow-ups; do not author the addendum in this change.

## Deferred / Follow-up (do NOT implement in this batch)
- ADR-011 addendum (design Decision 1) — needs separate user confirmation, per `review-session` precedent.
- Performer identity (name) in the representative's list view — needs a `users` read no port supports today.
- Frozen `elementCode` on `ElementReviewEntry` — needs a schema change; out of scope here.
