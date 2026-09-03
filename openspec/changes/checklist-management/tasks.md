# Tasks: Checklist Question Pool and Review Template Versioning

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~3400-3900 (2 migrations, 2 new API modules across 4 layers each incl. a 10-use-case state machine + atomic activation transaction, a cross-module cleaner port, 2 validation sub-packages, 4th three-way enum declaration, 6 web pages, 3 locale files, full e2e + concurrency coverage, 1 docs correction) |
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
| 1 | Migration: `ReviewFrequency` enum + `ChecklistQuestion` table | PR 1 | ~110 | Mechanical; unblocks Phase A |
| 2 | `checklist-question` domain: entity, `ReviewFrequency` union, errors | PR 2 | ~140 | Depends on PR 1 (types only); zero Prisma |
| 3 | `checklist-question` application + validation: port, 4 use cases, fake, Zod schemas | PR 3 | ~260 | Depends on PR 2 |
| 4 | `checklist-question` infra + presentation + permissions: adapter, mapper, controller, DTOs, error codes, module, parity spec, `Permission` union + `SYSTEM_ADMIN` row | PR 4 | ~340 | Depends on PR 3; independently shippable end of Phase A |
| 5 | Web: question pool list/create/edit pages, api client, labels, i18n, routes, E2E | PR 5 | ~420 | Depends on PR 4. Phase A complete and independently useful |
| 6 | Migration: `ReviewTemplateStatus` enum + `ReviewTemplate` + `ReviewTemplateQuestion` tables, 3 unique indexes, FK | PR 6 | ~160 | Depends on PR 1 (FK target); unblocks Phase B |
| 7 | `review-template` domain: entity + status guards, `ReviewTemplateStatus` union, errors; `checklist-question` gains `DraftSelectionCleaner` port + Prisma adapter + gated cleanup wiring in soft-delete use case | PR 7 | ~220 | Depends on PR 6 (table must exist) and PR 3 (soft-delete use case to gate) |
| 8 | `review-template` application + validation: port, 6 use cases, fake, Zod schemas; `reviewTemplate:*` permissions | PR 8 | ~330 | Depends on PR 7 |
| 9 | `review-template` infra + presentation: atomic `activate()` transaction, two read paths, controller, DTOs, 6 error codes, module (imports `ChecklistQuestionModule`), parity + migration guard specs | PR 9 | ~420 | Depends on PR 8; the highest-risk unit (concurrency) |
| 10 | Web: templates list/create/builder pages, api client, labels, i18n, routes | PR 10 | ~440 | Depends on PR 9 |
| 11 | E2E both modules incl. concurrency + docs correction + browser verification + final checks | PR 11 | ~340 | Depends on PR 5, PR 10 |

## Phase 1: Checklist Question Migration (PR 1) — mechanical, no TDD
- [x] 1.1 `apps/api/prisma/schema.prisma`: add `enum ReviewFrequency { MONTHLY QUARTERLY SEMIANNUAL ANNUAL }` + `ChecklistQuestion` model (`id @db.Uuid`, `elementType`, `frequencies ReviewFrequency[]`, `text`, `deletedAt?`) (spec: checklist-question-management "Review Frequency Enumeration").
- [x] 1.2 Hand-written `migrations/<ts>_add_checklist_question/migration.sql`: `CREATE TYPE`, `CREATE TABLE` (design File Changes).
- [x] 1.3 Apply in dev; confirm no `DropForeignKey`/`DropIndex` emitted for existing FKs/indexes; regenerate client.

## Phase 2: Checklist Question Domain (PR 2) — Strict TDD
- [x] 2.1 RED/GREEN `domain/review-frequency.ts` — `REVIEW_FREQUENCIES` const, `as const satisfies readonly ValidatedReviewFrequency[]` (design Decision 1).
- [x] 2.2 RED/GREEN `domain/checklist-question.entity.ts` — plain fields, zero Prisma, no constructor validation (design Decision 7).
- [x] 2.3 `domain/errors/checklist-question-not-found.error.ts` — mechanical.

## Phase 3: Checklist Question Application + Validation (PR 3) — Strict TDD
- [x] 3.1 `application/ports/checklist-question.repository.port.ts` — token + `create`/`findById`/`findAll`/`updateById`/`softDeleteById`.
- [x] 3.2 RED/GREEN `create-checklist-question.use-case.ts` (spec: "Create Checklist Question", empty-`frequencies`/missing-field scenarios).
- [x] 3.3 RED/GREEN `list-checklist-questions.use-case.ts` — excludes soft-deleted, empty pool valid (spec: "List Checklist Questions", "The Pool Ships Empty").
- [x] 3.4 RED/GREEN `update-checklist-question.use-case.ts` — `elementType` never mutated, 404 on missing/deleted (spec: "Update Checklist Question").
- [x] 3.5 RED/GREEN `soft-delete-checklist-question.use-case.ts` — never blocked by references, 404 on missing/already-deleted; cleanup hook point left as a no-op call site for Phase 7 (spec: "Soft-Delete Checklist Question Is Never Blocked").
- [x] 3.6 `application/use-cases/testing/in-memory-checklist-question.repository.ts` — fake.
- [x] 3.7 `packages/validation/src/checklist-question/**` + `src/index.ts` — `reviewFrequencySchema`, create/update schemas, `.min(1)` on `frequencies`.

## Phase 4: Checklist Question Infra + Presentation + Permissions (PR 4) — mechanical + integration specs
- [x] 4.1 `infrastructure/persistence/prisma-checklist-question.repository.ts` (extends `SoftDeletableRepository`) + mapper.
- [x] 4.2 Integration: `review-frequency-parity.integration.spec.ts` — TS union / Postgres enum / Zod schema agree (spec: "The three declarations agree").
- [x] 4.3 `presentation/checklist-question.controller.ts` + DTOs + Swagger; `checklist-question-error-code.ts` (`CHECKLIST_QUESTION_NOT_FOUND`); `checklist-question.module.ts` exporting the repository token.
- [x] 4.4 `shared/application/authorization/permission.ts` — add `checklistQuestion:create|read|update|delete`; `role-permission.checker.ts` — `SYSTEM_ADMIN` row only, other 4 stay `[]` (spec: authorization "Permission Check on Checklist Question Endpoints").
- [x] 4.5 Register `ChecklistQuestionModule` in `app.module.ts`.
- [x] 4.6 Reconcile validation-error path: PR 3 added `CreateChecklistQuestionUseCase.assertValidInput` (`InvalidChecklistQuestionInputError`) as a use-case-level duplicate of the Zod `.min(1)`/required-field checks, since `packages/validation` has no Jest runner to RED/GREEN those scenarios directly (deviates from the `inspectable-element` precedent, which leaves this solely to the Zod/DTO pipe, tested at e2e only — flagged in fresh-context review of PR 3). Decide here: map `InvalidChecklistQuestionInputError` to 400 alongside the Zod pipe's 400, or drop the guard now that e2e (Phase 5's `checklist-question.e2e-spec.ts`, task 5.8) can cover it like the precedent does. Also decide whether `update-checklist-question.use-case.ts` needs the same treatment for symmetry — currently it has none, and "update to an empty frequencies set" has zero test coverage anywhere yet.
  - **Decision (PR 4)**: kept the guard; mapped `InvalidChecklistQuestionInputError` to a plain `BadRequestException` (no `code` field) in `ChecklistQuestionController.mapMutationError`, matching the Zod pipe's own uncoded 400 shape rather than wrapping it in `buildCodedError` — there is no second REACHABLE 400 cause on this route (the guard is unreachable through HTTP; ZodValidationPipe rejects the same shapes first), so a `code` would imply a client-distinguishable case that doesn't exist. `update-checklist-question.use-case.ts` gets NO symmetric guard: `updateChecklistQuestionSchema.frequencies` is already `z.array(...).min(1).optional()`, so "update to an empty frequencies set" is already a 400 at the Zod boundary — confirmed by reading the schema, not assumed.

## Phase 5: Web — Question Pool (PR 5)
- [x] 5.1 `apps/web/src/api/checklist-question.ts` — typed calls + error-code union.
- [x] 5.2 `apps/web/src/checklist-question/error-messages.ts`, `review-frequency-labels.ts`, `element-type-labels.ts` (reused).
- [x] 5.3 `apps/web/src/pages/ChecklistQuestionsListPage.tsx` — grouped by `elementType`, frequency tags, verbatim `text`, empty/loading/error states (spec: checklist-question-admin-ui "List the Question Pool", "Question Text Is Rendered Verbatim").
- [x] 5.4 `apps/web/src/pages/ChecklistQuestionCreatePage.tsx` / `ChecklistQuestionEditPage.tsx` — client validation via shared schema, prefilled edit (spec: "Create Checklist Question", "Edit Checklist Question").
- [x] 5.5 Confirmed soft-delete via `ConfirmDialog`, no blocking-dependency copy (spec: "Confirmed Soft-Delete").
- [x] 5.6 `App.tsx` — 3 routes under `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`, static-before-dynamic ordering.
- [x] 5.7 `i18n/locales/{en,es,ca}.json` — real `checklistQuestion.*` keys + label maps; extend `locales.test.ts`.
- [x] 5.8 `apps/api/test/checklist-question.e2e-spec.ts` — full lifecycle, empty-pool, dup text allowed, RBAC matrix (401/403 on all 4 routes, 4 non-admin roles), soft-delete never blocked.

## Phase 6: Review Template Migration (PR 6) — mechanical, no TDD
- [x] 6.1 `schema.prisma`: `enum ReviewTemplateStatus { draft active retired }`, `ReviewTemplate` (`draftQuestionIds String[] @db.Uuid`, `version Int?`), `ReviewTemplateQuestion` (`questionText String` NOT NULL) + `@@index([templateId])` (design Decisions 1-3, Interfaces).
- [x] 6.2 Hand-written `migrations/<ts>_add_review_template/migration.sql`: enum + 2 tables, 3 hand-written unique indexes (one-active-per-lineage, one-draft-per-lineage, lineage-version-key), FK `ReviewTemplateQuestion.templateId → ReviewTemplate(id)` (design Decision 3 SQL block).
- [x] 6.3 Apply in dev; confirm no `DropForeignKey`/`DropIndex` for the 6 pre-existing hand-written FKs/indexes; regenerate client.

## Phase 7: Review Template Domain + Cleaner (PR 7) — Strict TDD
- [x] 7.1 RED/GREEN `review-template/domain/review-template-status.ts` — `as const satisfies` gate (design Decision 1).
  - **Decision (PR 7)**: the `satisfies` gate is **deferred**, not wired — `packages/validation` has no `review-template` sub-package yet (Phase 8, tasks.md 8.8, is what creates `reviewTemplateStatusSchema`). This exactly mirrors `review-frequency.ts`'s own history: Phase 2 shipped it domain-only (plain `as const`), and only Phase 3, once `@sf-manager/validation` exported the type, wired the gate. `review-template-status.ts` carries a comment flagging Phase 8 as the follow-up that must add the gate.
- [x] 7.2 RED/GREEN `review-template/domain/review-template.entity.ts` + status guards (`assertActivatable`, `assertEditable`) — `draft→active` ok, `active`/`retired` reject every mutation and re-activation (design Decision 7; spec: "Frozen Templates Are Immutable").
- [x] 7.3 `review-template/domain/errors/**` — 5 errors (`ReviewTemplateNotFoundError`, `ReviewTemplateNotEditableError`, `ReviewTemplateEmptyError`, `ReviewTemplateDraftExistsError`, `TransactionConflictError`/`ACTIVATION_CONFLICT`).
  - **Note**: the task description said "6 errors" but design.md's Findings #2 and proposal.md's error-code list (lines 96-98) name exactly 5 codes owned by `review-template` itself (`REVIEW_TEMPLATE_NOT_FOUND`, `_NOT_EDITABLE`, `_EMPTY`, `_DRAFT_EXISTS`, `_ACTIVATION_CONFLICT`). `CHECKLIST_QUESTION_NOT_FOUND` appears alongside them in the proposal's list but is owned and already created by `checklist-question` (Phase 2) — reused, not re-declared here. Phase 9's `review-template-error-code.ts` (tasks.md 9.5, "6 codes") is presentation-layer and may re-export/union that 6th, imported code; that is out of scope for this domain-errors task.
- [x] 7.4 `checklist-question/application/ports/draft-selection-cleaner.port.ts` + RED/GREEN `infrastructure/persistence/prisma-draft-selection-cleaner.ts` — `array_remove` raw SQL, resolves `PrismaService` via `@Global()` module, no cross-module import (design Decision 6).
- [x] 7.5 Wire the cleaner into `soft-delete-checklist-question.use-case.ts`, gated on `wasDeleted === true` (spec: "Deletion removes the question from drafts").

## Phase 8: Review Template Application + Validation (PR 8) — Strict TDD
- [x] 8.1 `application/ports/review-template.repository.port.ts` — `create`/`findById`/`findAll`/`findDraftWithLiveQuestions`/`findFrozenWithSnapshot`/`replaceDraftQuestions`/`activate`/`softDeleteDraftById` (design Decision 5, Interfaces).
- [x] 8.2 RED/GREEN `create-draft-review-template.use-case.ts` — one-draft-per-lineage guard, 409 `DRAFT_EXISTS` (spec: "Create Draft Template").
- [x] 8.3 RED/GREEN `set-review-template-questions.use-case.ts` — full-replace semantics, unknown/soft-deleted id → 404, frozen → 409, cross-frequency allowed (spec: "Replace a Draft's Ordered Question Selection").
- [x] 8.4 RED/GREEN `activate-review-template.use-case.ts` — pure guards before the repo call: not-`draft` → 409 `NOT_EDITABLE`, empty selection → 409 `EMPTY` fast path (spec: "Activation Freezes...Atomically", data flow steps 1-4).
- [x] 8.5 RED/GREEN `list-review-templates.use-case.ts` / `read-review-template.use-case.ts` — dispatch on `status` between the two read paths, assert the pool port is never called on the frozen path (spec: "List and Read Templates", "Drafts Track the Live Pool").
- [x] 8.6 RED/GREEN `soft-delete-draft-review-template.use-case.ts` — only `draft` deletable, frozen → 409 (spec: "Only Drafts May Be Soft-Deleted").
- [x] 8.7 `application/use-cases/testing/in-memory-review-template.repository.ts` — fake reproducing both read paths and the version/gap rule.
- [x] 8.8 `packages/validation/src/review-template/**` + `src/index.ts` — create/set-questions schemas, `reviewTemplateStatusSchema`. Also wired the deferred `as const satisfies readonly ValidatedReviewTemplateStatus[]` gate on `review-template-status.ts` (deferred at PR 7) now that the type exists.
- [x] 8.9 `permission.ts` — add `reviewTemplate:create|read|update|delete|activate`; `role-permission.checker.ts` — `SYSTEM_ADMIN` row only (spec: authorization "Permission Check on Review Template Endpoints", "No Standalone Retire Permission"). Completed as part of PR 9's scope.

## Phase 9: Review Template Infra + Presentation (PR 9) — Strict TDD (activate) + integration specs
- [x] 9.1 RED/GREEN `infrastructure/persistence/prisma-review-template.repository.ts::activate()` — Serializable `$transaction`: assign version, `INSERT…SELECT` snapshot (design Decision 4 SQL), retire predecessor **before** flipping to active (statement order load-bearing), map `P2034`/`P2002` → `TransactionConflictError` (design Decision 3, Data Flow).
- [x] 9.2 `findDraftWithLiveQuestions` / `findFrozenWithSnapshot` — frozen query does not reference `"ChecklistQuestion"` (design Decision 5).
- [x] 9.3 Integration: two-connection concurrent `activate()` race — exactly one succeeds, one `TransactionConflictError`, exactly one `active` row remains (spec: "Concurrent activations leave exactly one active version").
- [ ] 9.4 Integration: `review-template-status-parity.integration.spec.ts`; migration guard — 3 unique indexes + FK in `pg_indexes`/`pg_constraint`, `questionText` `NOT NULL`.
- [ ] 9.5 `presentation/review-template.controller.ts` + DTOs — 6 routes incl. `PUT .../questions`, `POST .../activate` (design Decision 8); `review-template-error-code.ts` (6 codes); `review-template.module.ts` imports `ChecklistQuestionModule`; register in `app.module.ts`.

## Phase 10: Web — Review Templates (PR 10)
- [ ] 10.1 `apps/web/src/api/review-template.ts` — typed calls + error-code union.
- [ ] 10.2 `apps/web/src/review-template/error-messages.ts`, `template-status-labels.ts` (`review-frequency-labels.ts` reused).
- [ ] 10.3 `apps/web/src/pages/ReviewTemplatesListPage.tsx` — grouped by `elementType`+`frequency`, version/status badge, empty/loading/error states (spec: review-template-admin-ui "List Templates With Version and Status").
- [ ] 10.4 `apps/web/src/pages/ReviewTemplateCreatePage.tsx` — 409 `DRAFT_EXISTS` shown as specific message (spec: "Create Draft Template").
- [ ] 10.5 `apps/web/src/pages/ReviewTemplateDetailPage.tsx` — one page, inline picker for drafts (pre-filtered by frequency, toggle to reveal others), read-only render of frozen snapshot, no edit controls on frozen (design Decision 9; spec: "Draft Builder Selects and Orders Questions", "Frozen Versions Are Read-Only").
- [ ] 10.6 Activate `ConfirmDialog` — names the version being retired, omits the claim on first activation, `EMPTY`/`NOT_EDITABLE` shown as specific messages (spec: "Activate With a Confirmation That Names the Retirement").
- [ ] 10.7 Draft-only delete control, no delete on frozen (spec: "Delete Control Applies to Drafts Only").
- [ ] 10.8 `App.tsx` — 3 routes, static-before-dynamic ordering; `i18n/locales/{en,es,ca}.json` — real `reviewTemplate.*` keys + label maps; extend `locales.test.ts`.

## Phase 11: E2E, Docs Correction, Browser Verification, Final Checks (PR 11)
- [ ] 11.1 `apps/api/test/review-template.e2e-spec.ts` — full lifecycle; second draft 409; activate empty 409 + no version consumed; discarded draft leaves no version gap; `PUT`/`activate` on frozen 409 `NOT_EDITABLE`; post-activation question edit → frozen response byte-identical; soft-delete a referenced question → frozen still renders, draft drops it; cross-frequency pick accepted; RBAC matrix on all 6 routes (spec: review-template-management, all requirements).
- [ ] 11.2 Grep-confirm no `ReviewSession`/`ElementReviewEntry`/`QuestionAnswer` table, model, route or page exists (spec: "No Review Session Surface").
- [ ] 11.3 `docs/architecture/domain-model-inspections.md` — fix `text` (i18n key → free text) wording; close the wording-change open question with snapshot-on-freeze; document `draftQuestionIds`/`questionText`; record the `active`-flag deferral.
- [ ] 11.4 Browser verification (`npm run dev`, `claude-in-chrome`, `SYSTEM_ADMIN` session): empty pool → first question → first draft → builder → activate → retire predecessor; edit-after-freeze divergence; non-admin `NotAuthorized` surface (CLAUDE.md "Verifying UI Changes").
- [ ] 11.5 Full API + web suites, lint, build pass; `no-restricted-imports` passes.

## Rules Applied
- Strict TDD: RED/GREEN on entities, status guards, use cases, the activation transaction, mappers where non-trivial. Migrations/DTOs/module wiring/schema files/error-code enums are mechanical.
- Phases 1 and 6 (migrations) are isolated and mechanical, no business logic alongside.
- Phase 7's cleaner ships with the domain PR because it depends on the Phase 6 table and modifies Phase 3's soft-delete use case — a genuine behavior change per design Decision 6, not split further.
- Design Decisions 1-9 (closed-catalog-via-validation-package, snapshot-in-`ReviewTemplateQuestion`-NOT-NULL, Serializable-transaction-plus-partial-index, DB-side `INSERT…SELECT` snapshot, two-read-paths-one-DTO, gated cleaner, no VOs, routes/permissions/codes, inline builder) are settled — do not re-litigate at apply time.
- Do not re-open any settled product decision from the proposal (SYSTEM_ADMIN-only, single canonical text, snapshot-on-freeze, empty pool no seed, retirement-only-via-activation, soft-delete never blocked).
- Phase A (PR 1-5) is independently shippable and useful on its own; Phase B (PR 6-11) strictly builds on it.
