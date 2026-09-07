# Tasks: Perform a Review Session (FR-007)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~4200-4900 (2 migrations, new resource-scope auth mechanism across 2 modules, a from-scratch 3-entity aggregate module across 4 layers incl. 8 use cases + a session-load service, 2 new by-user repo methods x2 ports, 4 new web pages + entry-point wiring, 3 locale files, full e2e incl. an 8-route scope matrix, 1 admin control, 1 docs correction) |
| 400-line budget risk | High (as a single PR); each chained slice below stays under budget |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 -> PR 9 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|---|---|---|---|---|
| 1 | `InspectableElement.deactivatedAt`: migration, entity, mapper, port, use cases, DTO, admin control (web) | PR 1 | ~420 | Independently shippable; no dependency on the rest |
| 2 | Scoped-authorization foundation: `CommunityScopeChecker` port + adapter, `findActiveByUser` on both assignment ports + adapters, `reviewSession:*` permission stubs, role activation | PR 2 | ~380 | Depends on nothing from PR 1; independently shippable |
| 3 | Review-session schema: migration (3 tables, 2 enums, hand-written FKs incl. `ON DELETE CASCADE`, partial unique draft index, `observations` CHECK) + domain entities/invariants + errors | PR 3 | ~520 | Depends on PR 1 (eligibility predicate reads `deactivatedAt`) and PR 2 (permissions exist for later PRs) at the schema/domain level only |
| 4 | Application ports/services + open/resume/discard/list use cases + `SessionAccess` + template `findActiveByElementType` query + `/review-scope`, `POST /review-sessions`, `GET /review-sessions`, `GET /review-sessions/:id`, `DELETE /review-sessions/:id` endpoints | PR 4 | ~560 | Depends on PR 3 |
| 5 | By-code resolution (`findReviewableByCode`) + record-answer/mark-unreviewed use cases + `GET .../elements/:code` + `PUT .../entries/:elementId` endpoints + Zod discriminated-union schemas | PR 5 | ~520 | Depends on PR 4 |
| 6 | Complete-session use case + immutability enforcement + `POST .../complete` + full e2e (scope matrix, indistinguishability, immutability x2, frozen snapshot, scope guards) | PR 6 | ~640 | Depends on PR 5; highest-risk unit |
| 7 | Web: api client, 4 pages (`ReviewSessions`, `New`, `Detail`, `Element`), routes, `HealthPage` entry link, i18n | PR 7 | ~560 | Depends on PR 6 (needs the full API surface) |
| 8 | Docs correction (`domain-model-inspections.md`) + browser verification (both non-admin roles) + final checks | PR 8 | ~180 | Depends on PR 7 |

## Deferred / Follow-up (do NOT implement in this batch)

- **ADR-011 addendum** (design.md Decision 4, "Open Questions"): explicitly
  **postponed by the user** until this change's implementation is further
  along. Do not write it as part of any PR above. Resurface it for
  reconsideration **after PR 2 (scoped-authorization foundation) ships** —
  that PR is the first concrete implementation of ADR-011 Decision 3's
  "separate, composable check" and is the natural trigger point to revisit
  writing the addendum (and correcting ADR-011's stale reference to
  `CommunityMaintenanceAssignment`).

## Phase 1: InspectableElement Active State (PR 1)
- [x] 1.1 `apps/api/prisma/schema.prisma`: add `deactivatedAt DateTime?` to `InspectableElement` (NULL = active, no default — no backfill needed) (design Decision 3).
- [x] 1.2 Hand-written `migrations/<ts>_add_inspectable_element_deactivated_at/migration.sql`: single `ADD COLUMN`. Apply in dev; confirm no `DropForeignKey`/`DropIndex` for existing hand-written FKs/indexes; regenerate client.
- [x] 1.3 Integration: `is_nullable = 'YES'` and `COUNT(*) WHERE "deactivatedAt" IS NOT NULL = 0` after migration (spec: inspectable-element-management "Pre-Existing Elements Are Active After the Migration").
- [x] 1.4 RED/GREEN `inspectable-element/domain/inspectable-element.entity.ts` — `deactivatedAt` field + `isDeactivated` getter (spec: "Element Active State").
- [x] 1.5 `application/ports/inspectable-element.repository.port.ts` — `updateById`'s `changes` type gains `deactivatedAt` member; mapper reads/writes it.
- [x] 1.6 RED/GREEN existing update use case — reusing `inspectableElement:update`, no new permission (spec: "Decommission and Reactivate an Element"); reject reactivating a soft-deleted element (404 via existing path).
- [x] 1.7 `packages/validation/src/inspectable-element/**` — `deactivated?: boolean` on the update schema.
- [x] 1.8 Controller/DTO: element responses include `deactivated`/`deactivatedAt` (spec: "Element State Exposed on Element Responses").
- [x] 1.9 Web: `InspectableElementEditPage.tsx` — decommission/reactivate checkbox control; `CommunityElementsListPage.tsx` — state column (spec: inspectable-element-admin-ui "Decommission and Reactivate Control", "Element State Shown in the List").
- [x] 1.10 `i18n/locales/{en,es,ca}.json` — `inspectableElement.deactivated`/state labels; extend `locales.test.ts` (spec: "Internationalization Coverage for the State Controls").
- [x] 1.11 `apps/api/test/inspectable-element.e2e-spec.ts` — decommission/reactivate round trip, element list unaffected in lifecycle filtering (spec: "Element Lifecycle Filtering Unchanged").

## Phase 2: Scoped-Authorization Foundation (PR 2)
- [x] 2.1 `shared/application/authorization/permission.ts` — add 5 `reviewSession:create|read|perform|complete|discard` members (design Decision 10).
- [x] 2.2 `.../auth/infrastructure/authorization/role-permission.checker.ts` — `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` get the identical `reviewSession:*` set; `SYSTEM_ADMIN`, `MANAGER`, `MAINTENANCE_COMPANY_MANAGER` unchanged (spec: authorization "Technician and Representative Become Operational").
- [x] 2.3 RED/GREEN `shared/application/authorization/community-scope.checker.port.ts` — `isAssignedTo(userId, role, communityId): Promise<boolean>` (design Decision 4, Layer 2).
- [x] 2.4 RED/GREEN `.../community/infrastructure/authorization/assignment-community-scope.checker.ts` — fail-closed exhaustive `switch` on role, dispatches to technician/representative repo, `row !== null && row.deactivatedAt === null` (spec: authorization "Resource Scope"). Table-driven unit: all 5 roles x {no row, deactivated row, active row}.
- [x] 2.5 RED/GREEN `community-technician.repository.port.ts` + `community-representative.repository.port.ts` — add `findActiveByUser(userId): Promise<T[]>`, filtered `deactivatedAt IS NULL`; `countActiveByUser` untouched (design Decision 5).
- [x] 2.6 Prisma adapters + in-memory fakes for both new methods.
- [x] 2.7 `CommunityModule` exports `COMMUNITY_SCOPE_CHECKER`; confirm no import cycle (community does not import review-session).
- [x] 2.8 Unit: assignment-scope adapter enforces "deactivating an assignment removes access on the next request" with no cache (spec: "Deactivating an assignment removes access on the next request").

## Phase 3: Review-Session Schema + Domain (PR 3)
- [x] 3.1 `schema.prisma`: `enum ReviewSessionStatus { draft completed }`, `enum AnswerValue { YES NO NOT_APPLICABLE }`, `ReviewSession`, `ElementReviewEntry` (`observations String?`), `QuestionAnswer` models per design Interfaces/Contracts — no `deletedAt` on any of the three.
- [x] 3.2 Hand-written `migrations/<ts>_add_review_session/migration.sql`: 3 tables, 2 enums, 6 hand-written cross-module FKs (the two rooted at `ReviewSession` -> `ElementReviewEntry`/`QuestionAnswer` chain declare `ON DELETE CASCADE`), partial unique index `ReviewSession_open_draft_key` on `(communityId, templateId, performedById) WHERE status = 'draft'`, `ElementReviewEntry_observations_not_blank` CHECK. Apply in dev; confirm no `DropForeignKey`/`DropIndex` for the now-12 pre-existing hand-written objects (7 FKs + 5 indexes); regenerate client.
- [x] 3.3 Integration: `pg_indexes`/`pg_constraint` — 6 FKs (2 with `ON DELETE CASCADE`), partial unique index, CHECK constraint, no `deletedAt` column on the three tables (spec: "Review Records Carry No Deletion Path").
- [x] 3.4 RED/GREEN `domain/{review-session-status,answer-value}.ts` — authoritative TS unions (design Decision 9).
- [x] 3.5 RED/GREEN `domain/element-review-entry.entity.ts` — no public constructor; `reviewed(props)` / `unreviewed(props)` factories; `unreviewed('')`/whitespace throws `MissingObservationsError`; `reviewed()` leaves `observations === null` (design Decision 1; spec: "An Unreviewed Element Requires a Recorded Reason").
- [x] 3.6 RED/GREEN `domain/question-answer.entity.ts` — `questionId` + `AnswerValue`, plain fields.
- [x] 3.7 RED/GREEN `domain/review-session.entity.ts` — aggregate root; `recordEntry`/`markUnreviewed`/`complete`/`discard` each throw `ReviewSessionNotEditableError` when `status !== 'draft'` (design Decision 8; spec: "Completed Sessions Are Immutable" — domain-layer scenario).
- [x] 3.8 `domain/errors/*.ts` — `ReviewSessionNotFoundError`, `ReviewSessionNotEditableError`, `MissingObservationsError`, `UnreviewedElementsWithoutReasonError`, `OpenDraftAlreadyExistsError`.
- [x] 3.9 Unit: completion coverage logic (pure) — active element with no entry rejects; decommissioned mid-walk not required; entry with only `observations` accepted (spec: "Complete a Session With Explained Gaps Only").

## Phase 4: Open/Resume + Template Resolution (PR 4)
- [ ] 4.1 RED/GREEN `review-template/application/ports/review-template.repository.port.ts` — `findActiveByElementType(elementType): Promise<ReviewTemplate[]>` (design Decision 7).
- [ ] 4.2 `application/ports/review-session.repository.port.ts` — `create`, `findByIdForPerformer`, `findDraftsByPerformer`, `upsertEntry`, `complete`, `discardDraft` — deliberately no `findById`/`updateById` (design Decisions 4, 8).
- [ ] 4.3 RED/GREEN `application/services/session-access.service.ts` — `loadForActor(sessionId, actor)`: `findByIdForPerformer` -> null => `ReviewSessionNotFoundError`; then `communityScopeChecker.isAssignedTo` -> false => same error (design Decision 4, Layer 3).
- [ ] 4.4 RED/GREEN `open-review-session.use-case.ts` — scope check -> 403 `COMMUNITY_NOT_IN_SCOPE`; template not active -> 404 `ACTIVE_TEMPLATE_NOT_FOUND`; `P2002` -> `OpenDraftAlreadyExistsError` (spec: "Open a Review Session Against a Community and a Specific Template", "At Most One Open Draft Per Community, Template and User").
- [ ] 4.5 RED/GREEN `get-review-scope.use-case.ts` — `findActiveByUser` both ports + `communityRepository.findById` per assignment + `findActiveByElementType`.
- [ ] 4.6 RED/GREEN `list-own-review-sessions.use-case.ts` — draft sessions only for the caller (design Open Question, scoped to drafts).
- [ ] 4.7 RED/GREEN `read-review-session.use-case.ts` — via `SessionAccess`, returns entries + coverage counts, not question set (design Decision 11).
- [ ] 4.8 RED/GREEN `discard-review-session.use-case.ts` — hard delete via `discardDraft`, `WHERE status='draft'`, false => 409; cascade removes entries/answers (spec: "Discard a Draft Session").
- [ ] 4.9 `application/use-cases/testing/in-memory-review-session.repository.ts` — fake mirroring the shipped module shape.
- [ ] 4.10 Prisma adapter: `prisma-review-session.repository.ts` + `review-session.mapper.ts`; `P2002` on the partial unique index -> `OpenDraftAlreadyExistsError`.
- [ ] 4.11 `presentation/review-session.controller.ts` (partial) + DTOs — `GET /review-scope`, `POST /review-sessions`, `GET /review-sessions`, `GET /review-sessions/:sessionId`, `DELETE /review-sessions/:sessionId`; `@RequirePermission`; `review-session.module.ts` imports Community/ReviewTemplate modules; register in `app.module.ts`.
- [ ] 4.12 Integration: open-draft race — two concurrent opens for the same (community, template, performer) => exactly one 201, one 409 (spec: "At Most One Open Draft Per Community, Template and User").
- [ ] 4.13 Integration: enum parity — `ReviewSessionStatus`/`AnswerValue` TS unions == Prisma enums == Zod schemas (shipped 3-way parity precedent).

## Phase 5: By-Code Resolution + Record Answers + Mark Unreviewed (PR 5)
- [ ] 5.1 RED/GREEN `inspectable-element/application/ports/inspectable-element.repository.port.ts` — `findReviewableByCode(communityId, elementType, code)`; single `WHERE` collapses unknown/foreign/wrong-type/decommissioned/soft-deleted to one `null` (design Decision 6; spec: "Resolving an Element by Code Is Always Scope-Constrained", "Rejected Codes Are Indistinguishable").
- [ ] 5.2 RED/GREEN `resolve-element-by-code.use-case.ts` — via `SessionAccess` -> `findReviewableByCode(session.communityId, session.elementType, code)` -> null => one `InspectableElementNotFoundError`; `findFrozenWithSnapshot(session.templateId)` for wording only (spec: "Sessions Render the Template's Frozen Snapshot").
- [ ] 5.3 `packages/validation/src/review-session/**` — entry-write `z.discriminatedUnion` (`{answers:[...]}` | `{observations:string}`), answer-value schema, open-request schema.
- [ ] 5.4 RED/GREEN `record-entry.use-case.ts` (`upsert-entry`) — via `SessionAccess` -> `session.recordEntry`/`markUnreviewed`; status != draft => 409 `REVIEW_SESSION_NOT_EDITABLE`; answer set != frozen question set => 400 `ANSWERS_DO_NOT_MATCH_TEMPLATE`; re-recording replaces, not duplicates (`@@unique([reviewSessionId, inspectableElementId])`) (spec: "Record an Element's Answers").
- [ ] 5.5 `repository.upsertEntry(sessionId, entry, answers)` — Prisma adapter, durable immediately (design Data Flow "WALK").
- [ ] 5.6 `presentation/review-session.controller.ts` (extend) + DTOs — `GET /review-sessions/:sessionId/elements/:code`, `PUT /review-sessions/:sessionId/entries/:elementId`; error-code mapping for `ELEMENT_NOT_FOUND`, `REVIEW_SESSION_NOT_EDITABLE`, `ANSWERS_DO_NOT_MATCH_TEMPLATE`.
- [ ] 5.7 Unit: `ElementReviewEntry` `answers XOR observations` — both-populated state unconstructible (reconfirm at use-case boundary via the Zod discriminated union).

## Phase 6: Complete Session + Immutability + E2E (PR 6)
- [ ] 6.1 RED/GREEN `complete-review-session.use-case.ts` — active elements of (community, elementType) MINUS entries; non-empty => 409 `UNREVIEWED_ELEMENTS_WITHOUT_REASON` listing offending codes; `repository.complete(id, at)` `WHERE status='draft'`, false => 409 (spec: "Complete a Session With Explained Gaps Only"; design Decision 2).
- [ ] 6.2 Confirm `ReviewSession.recordEntry`/`markUnreviewed`/`complete`/`discard` domain guards (Phase 3.7) are exercised through every mutating use case — no code path calls a repository mutation without going through the aggregate.
- [ ] 6.3 `apps/api/test/review-session.e2e-spec.ts` — full lifecycle: open -> resolve code -> record answers -> mark unreviewed with reason -> resume -> complete (spec: all "Performing a review" scenarios).
- [ ] 6.4 E2E: scope matrix — an authenticated, correctly-permissioned, unassigned user hits **all 8 routes**, one assertion per route, no sampling (spec: authorization "Refusal is proven on every endpoint, not a sample").
- [ ] 6.5 E2E: code indistinguishability — deep-equal status + full response body for unknown/foreign-community/wrong-element-type/decommissioned/soft-deleted codes (spec: "Rejected Codes Are Indistinguishable").
- [ ] 6.6 E2E: frozen snapshot — edit live `ChecklistQuestion` pool after opening, session's rendered wording unchanged; soft-delete a snapshotted question, it still renders (spec: "Sessions Render the Template's Frozen Snapshot").
- [ ] 6.7 E2E: immutability, permission gate — after completion, PUT entry / POST complete / DELETE as `SYSTEM_ADMIN` all 403 (SYSTEM_ADMIN holds no `reviewSession:*` permission, never reaches the domain guard).
- [ ] 6.8 E2E: immutability, domain guard — same three calls made **as the session's own performer** (who legitimately holds the permission) after completion, all 409 `REVIEW_SESSION_NOT_EDITABLE` — the row that actually exercises the domain invariant (design "corrected 2026-09-06"; do not ship only 6.7).
- [ ] 6.9 E2E: discard cascade — discarding a draft with recorded entries/answers removes them (no orphans); discarding a non-draft returns 409 and deletes nothing.
- [ ] 6.10 E2E: scope guards — grep/assert no history route, no scheduling logic, no `signed` value in the DB enum, no export exists (spec: "Adjacent Review Capabilities Are Not Introduced", review-template-management "No Review Session Surface").
- [ ] 6.11 E2E: partial-completion + decommissioned/soft-deleted elements do not block completion (spec: "Decommissioned and soft-deleted elements do not block completion").

## Phase 7: Web Flow (PR 7)
- [ ] 7.1 `apps/web/src/api/review-session.ts` — `apiFetch` typed client for all 8 endpoints + error-code union.
- [ ] 7.2 `review-session/error-messages.ts` — one uniform message for every code-rejection reason (spec: review-session-ui "Rejected Codes Get One Uniform Message").
- [ ] 7.3 `apps/web/src/pages/ReviewSessionsPage.tsx` — entry point: resumable draft(s) + Start-a-session link (spec: "Both Non-Admin Roles Have a Reachable Entry Point").
- [ ] 7.4 `apps/web/src/pages/ReviewSessionNewPage.tsx` — open form driven by `GET /review-scope`, community/template pickers limited to assigned communities (spec: "Open a Session From Assigned Communities Only").
- [ ] 7.5 `apps/web/src/pages/ReviewSessionDetailPage.tsx` — code entry (manual only, no scanner control) (spec: "Manual Code Entry Only"), progress, complete, discard (spec: "Pause, Resume and Discard a Draft").
- [ ] 7.6 `apps/web/src/pages/ReviewSessionElementPage.tsx` — answer form for one element, YES/NO/NOT_APPLICABLE + unreviewed-with-reason path (spec: "Answer an Element's Questions").
- [ ] 7.7 Completion flow surfaces `UNREVIEWED_ELEMENTS_WITHOUT_REASON` listing offending elements (spec: "Complete a Session and Explain Its Gaps").
- [ ] 7.8 `App.tsx` — first `ProtectedRoute allowedRoles={['MAINTENANCE_TECHNICIAN','COMMUNITY_REPRESENTATIVE']}` routes, static-before-dynamic ordering (spec: "Role-Gated Route Access for the Field Flow").
- [ ] 7.9 `HealthPage.tsx` — role-conditional link to `/review-sessions` (design Decision 10 rationale).
- [ ] 7.10 `i18n/locales/{en,es,ca}.json` — real `reviewSession.*` keys; extend `locales.test.ts` (spec: "Internationalization Coverage").
- [ ] 7.11 Unit (web): 4 pages x loading/error/empty; code-entry error path renders one message for every rejection reason; `locales.test.ts` parity.

## Phase 8: Docs Correction, Browser Verification, Final Checks (PR 8)
- [ ] 8.1 `docs/architecture/domain-model-inspections.md` — correct `CommunityMaintenanceAssignment` drift (never shipped; technician scope resolves through `CommunityTechnicianRepository`'s direct `(communityId, userId)` assignment); document `deactivatedAt`; document the `observations` placement decision.
- [ ] 8.2 Browser verification (`npm run dev`, `claude-in-chrome`): login as `MAINTENANCE_TECHNICIAN` AND separately as `COMMUNITY_REPRESENTATIVE` — open a session, walk (valid code, foreign code rejected, skip with reason), pause, resume, complete; `SYSTEM_ADMIN` decommission/reactivate round-trip (CLAUDE.md "Verifying UI Changes").
- [ ] 8.3 Full API + web suites, lint, build pass; `no-restricted-imports` passes (no `@prisma/client` outside `infrastructure/persistence/**`).
- [ ] 8.4 Final scope-guard grep: no `apps/web` camera/scanner dependency, no offline storage/service worker/sync logic added anywhere in the diff.

## Rules Applied
- Strict TDD: RED/GREEN on domain entities, invariants, the scope checker, use cases, and the session-access service. Migrations/DTOs/module wiring/enum declarations/mappers-without-logic are mechanical.
- Phase 1 and Phase 2 are independently shippable and carry no dependency on each other; both must land before Phase 3's schema depends on Phase 1's eligibility predicate and Phase 2's permissions.
- Design Decisions 1-11 (observations on `ElementReviewEntry`, stored-entry completion coverage, `deactivatedAt` orthogonal to `deletedAt`, `SessionAccess` as the only session-load path, `findActiveByUser` additions, one scope-constrained by-code method, `templateId`-only version storage, binary status enum, no Value Objects, flat API + 4 web routes, per-element frozen-question fetch) are settled — do not re-litigate at apply time.
- Do not re-open any settled product decision from the proposal (both roles day one, pausable/resumable, unknown-code reject-nothing, partial completion allowed, mandatory `observations`, `active` ships with a control, offline non-goal, no compliance calendar).
- The ADR-011 addendum (design "Open Questions") is explicitly deferred — see *Deferred / Follow-up* above. Do not author it in any PR of this chain.
- Every review-session endpoint must be covered by the Phase 6 scope matrix — no representative sampling (proposal risk 1, spec authorization "Refusal is proven on every endpoint, not a sample").
