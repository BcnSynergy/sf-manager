# Proposal: Checklist Question Pool and Review Template Versioning

## Intent

FR-005 and FR-005b are the last two pieces of *content* the review workflow
needs before FR-007 can exist. `inspectable-elements` made "what gets
inspected" real; this slice makes **"what gets asked, and as of when"** real.

Neither exists in code: `grep -r "ChecklistQuestion\|ReviewTemplate"
apps/api/src apps/web/src` returns zero matches, and `ReviewFrequency` — the
M/T/S/A axis every review is organised around — has no representation in any
layer, despite being named across the domain model, ADR-008 and FR-005/007/009.

Today an admin cannot express a checklist at all. RIPCI Anexo II Tabla I's
quarterly extinguisher checks live in a compliance doc, not in the product;
the annual set (UNE 23120, not public) is whatever the maintenance company
says it is, on paper. There is no way to write those questions down, and no
way to say "this exact set of questions constituted the quarterly review as of
March 2026" — which is precisely what a RIPCI-regulated, 5-year-retention
domain has to be able to answer.

Success looks like: a `SYSTEM_ADMIN` writes the quarterly extinguisher
questions into the pool, drafts "Revisión trimestral — extintores", picks and
orders the questions it contains, activates it — and the previously active
quarterly template retires in the same action, permanently frozen with exactly
the questions it had, **worded exactly as they read that day**. End to end,
Prisma → domain → use cases → REST → web UI.

Per ADR-006's 2026-08-25 addendum the minimal web UI ships **in this change**.
Third slice under that rule, no retrofit backlog behind it.

Context: `[[sdd/checklist-management/explore]]`,
`openspec/changes/archive/2026-09-02-inspectable-elements/`,
ADR-006, ADR-008, ADR-009, ADR-010, ADR-011, ADR-013, ADR-015,
`docs/architecture/domain-model-inspections.md`
§ReviewFrequency/§ChecklistQuestion/§ReviewTemplate/§ReviewTemplateQuestion,
`docs/requirements/functional-requirements.md` FR-005/FR-005b,
`docs/compliance/ripci-extinguisher-maintenance-program.md`.

## Settled product decisions

Closed with the product owner before this proposal. Inputs, not open items.

| Decision | Resolution |
|---|---|
| **Question text is runtime admin content, not an i18n key** | `ChecklistQuestion.text` is **free text the admin writes and edits at runtime**. The domain doc's `text` (i18n key) is wrong and contradicts FR-005 being a managed pool: a literal i18n key would mean a code deploy per new question. **This slice must fix that wording in `docs/architecture/domain-model-inspections.md`** — a source-of-truth correction, same kind of edit `inspectable-elements` PR 11/11 made. Rendered verbatim in the UI, like `Community.name`; never passed through `t()`. |
| **Question text is a single canonical text** | **Confirmed by the product owner (2026-09-02), closing what was Open Question 1.** One `text` field, one canonical language — **not** `{ en, es, ca }`, not a per-locale map. The three shipped locales govern *chrome* (labels, buttons, errors), not admin-authored content, exactly as `Community.name` already does. Per-locale text stays out of scope; if it is ever added, frozen historical versions keep the single text they were frozen with, which is the correct audit answer anyway (see the freeze decision below). |
| **Actors: `SYSTEM_ADMIN` only** | `MANAGER` + `MANAGE_CHECKLIST_CONTENT` **not activated**, matching `community`, `maintenance-company` and `inspectable-elements` verbatim. `User.managerCapabilities` still does not exist as a field anywhere (`grep` → zero matches); building capability resolution is its own slice. FR-005/005b stay deliberately half-satisfied. Confirmed deliberately, not inherited by default. |
| **`ReviewFrequency` ships now** | `MONTHLY \| QUARTERLY \| SEMIANNUAL \| ANNUAL`, introduced in this slice as a three-way declaration — authoritative TS union + Postgres enum + Zod schema — following ADR-008 and `inspectable-elements` design Decision 1 (`element-type.ts`'s `as const satisfies readonly ValidatedX[]` shape) exactly. Both `ChecklistQuestion.frequencies` and `ReviewTemplate.frequency` structurally require it; deferring it would mean shipping a stringly-typed placeholder and rewriting it next slice. |
| **Versioning: mutable draft, frozen on activate** | A template is created as a `draft` whose question selection and ordering are **freely editable**. `activate` **freezes it permanently** and retires whichever version was previously `active` for that `(elementType, frequency)` lineage, in one action. `active` and `retired` templates are immutable — no question edits, no reordering, no re-activation, no separate throwaway "version" entity. |
| **Freezing snapshots the question *wording*, not just the selection** | **Confirmed by the product owner (2026-09-02), reversing this proposal's earlier assumption and closing what was Open Question 2.** Activation must **persist the exact text of every included question as it read at that moment**, inside the frozen version itself. A frozen version must **not** resolve its wording by dereferencing the live, still-editable `ChecklistQuestion` row: editing a question in the pool afterwards must never retroactively change what an already-frozen template shows. Data-shape implication, stated here so `sdd-spec`/`sdd-design` cannot miss it: `ReviewTemplateQuestion` (or whatever holds a frozen version's ordered selection) carries its **own persisted copy of the question text**, distinct from the pool row, written as part of the activation transaction. `questionId` is retained as a **provenance link only** — traceability back to the pool and the future join key for FR-007 answers — never as the source of displayed wording. Exact mechanism (snapshot column populated at activation vs. frozen rows written at activation) is `sdd-design`'s call; *that* a frozen version persists its own wording is not. |
| **Drafts track the live pool; only frozen versions snapshot** | A `draft` renders the **current** pool text and picks up subsequent question edits — it is a work-in-progress, not an audit record. The snapshot is taken **once**, at activation. This keeps "freeze" a single, observable, atomic moment rather than a continuously maintained denormalisation. |
| **Version numbers are audit facts** | `version` increments per `(elementType, frequency)` lineage and is only meaningful once activated: **a discarded draft must not consume a version number**, so an activated lineage never has gaps. Representation (nullable column vs. assign-at-activation) is `sdd-design`'s call. |
| **Activation guards** | Activating a template with **zero questions is rejected**. `retired` is terminal — supersede by activating a successor, never by reactivation. |
| **Retirement is *only ever* a side effect of activation** | **Confirmed by the product owner (2026-09-02), closing what was Open Question 4.** There is **no standalone "retire this template" action** — no endpoint, no use case, no UI control, no permission. A version leaves `active` if and only if a successor for the same `(elementType, frequency)` is activated. A lineage therefore cannot be emptied: it has exactly zero or one `active` version, and once it has had one it always has one. This is a deliberate product invariant, not an omission — an element type + frequency that must stop offering a checklist is a discontinuation concern for the FR-007 scheduling slice, not a template-lifecycle one. |
| **At most one `draft` per `(elementType, frequency)`** | One work-in-progress per lineage, so "activate" is never ambiguous and the builder UI has exactly one editable target. |
| **Question lifecycle: soft-delete only** | `deletedAt` (ADR-010, which names `ChecklistQuestion` explicitly) is the **sole** off state. The domain doc's separate `active` ("retire without deleting history") flag is **not shipped** — mirroring `inspectable-elements`' identical call on `InspectableElement.active`: until the two states produce observably different behaviour, shipping both is two ways to do one thing. Deferred, settled — see the deferred items below. |
| **Soft-deleting a question is never blocked** | Deleting a question is **allowed even when templates reference it**, and it **removes the question from any `draft` template that had selected it**. Frozen (`active`/`retired`) templates are untouched and **continue to display it from their own snapshot**, with no read-back into the deleted pool row at all. This is the inverse of the `community`/`maintenance-company` delete guards, deliberately: a frozen template is an audit snapshot, not a live dependency. |
| **The pool ships empty — no seed data** | **Confirmed by the product owner (2026-09-02).** No RIPCI Anexo II Tabla I fixtures, no migration-seeded questions, no import path, no "starter set" button. An admin authors the first questions by hand through the UI this slice ships; the empty-pool state is a first-class UX case, not an accident. Seeding would freeze a compliance interpretation into a migration and make the *empty pool → first template* path untested on day one. |
| **`frequencies` is a suggestion, not a constraint** | A question tagged `QUARTERLY` **may** be selected into an `ANNUAL` template — RIPCI shares checks across periodicities. The template builder **pre-filters** by the template's frequency but must let the admin see and pick the rest. Non-empty set required (an untagged question would never surface as a suggestion). |
| **Question shape** | `text` only. No help text, no RIPCI clause reference, no required/optional flag, no pool-level `order` — `order` lives on `ReviewTemplateQuestion`, per the domain doc. |
| **Routes are flat, not community-nested** | Questions and templates are **global admin content scoped by `elementType`**, not per-community — unlike `inspectable-elements`. `/checklist-questions` and `/review-templates`. |
| **Web UI** | In scope, minimal: question pool list + create/edit, template list, one template builder/detail view, activate action. |

## Scope

### In Scope

- **Prisma**: `ReviewFrequency` Postgres enum (first use); `ChecklistQuestion`
  (`id` `@db.Uuid`, `elementType`, `frequencies ReviewFrequency[]`, `text`,
  `deletedAt?`); `ReviewTemplate` (`id`, `elementType`, `frequency`, `name`,
  `version`, `status`, `createdAt`, `deletedAt?`); `ReviewTemplateQuestion`
  (`id`, `templateId`, `questionId`, `order`, **plus the frozen question-text
  snapshot written at activation** — a persisted copy of the wording, not a
  dereference of `ChecklistQuestion.text`). Hand-written FKs and indexes in
  `migration.sql` per ADR-013 (no `@relation` in the schema), following the
  `InspectableElement` precedent, plus the constraint enforcing one `active`
  template per `(elementType, frequency)`.
- **Domain**: `ReviewFrequency` union (`review-frequency.ts`, mirroring
  `element-type.ts`), `ChecklistQuestion` and `ReviewTemplate` entities with
  the freeze/activate/retire transition rules as domain behaviour — including
  **capturing the question-text snapshot as part of the freeze**, so a frozen
  version is self-contained by construction and not by repository convention —
  plus their errors. Zero Prisma dependency (ADR-013).
- **Application — `checklist-question`**: repository port + create / list /
  update / soft-delete use cases, `elementType` and `frequencies` validated
  against the shared unions.
- **Application — `review-template`**: repository port + create-draft /
  list / read-with-questions / set-questions (replace the draft's ordered
  selection) / activate / soft-delete-draft use cases. Reads `ChecklistQuestion`
  through an exported port — one-directional (`review-template` →
  `checklist-question`), no DI cycle.
- **Presentation**: REST controllers, Zod validation via
  `ZodValidationPipe`, Swagger annotations, and coded errors built with the
  shared `buildCodedError` helper (`shared/presentation/http/coded-error.ts`) —
  `CHECKLIST_QUESTION_NOT_FOUND`, `REVIEW_TEMPLATE_NOT_FOUND`,
  `REVIEW_TEMPLATE_NOT_EDITABLE`, `REVIEW_TEMPLATE_EMPTY`,
  `REVIEW_TEMPLATE_DRAFT_EXISTS`, `REVIEW_TEMPLATE_ACTIVATION_CONFLICT`
  (409, the losing side of a concurrent activation race — distinct from
  `REVIEW_TEMPLATE_NOT_EDITABLE` because the losing draft was valid and
  editable at request time; surfaced by `sdd-design`'s atomicity
  mechanism, not foreseen at proposal time).
- **Authorization**: extend the `Permission` union with
  `checklistQuestion:create|read|update|delete` and
  `reviewTemplate:create|read|update|delete|activate` — `activate` split out
  from `update`, mirroring `community:assign`. Granted on the `SYSTEM_ADMIN`
  row only; the four non-admin rows stay `[]`.
- **Shared validation**: `packages/validation/src/checklist-question/**` and
  `.../review-template/**` (ADR-015), including `reviewFrequencySchema`.
- **Web UI**: `ChecklistQuestionsListPage` (grouped/filterable by
  `elementType`, showing frequency tags), `ChecklistQuestion{Create,Edit}Page`,
  `ReviewTemplatesListPage` (grouped by `elementType` + `frequency`, showing
  version and status badge), `ReviewTemplateDetailPage` (the builder: pick and
  order questions from the live pool for a draft; read-only for frozen
  versions, rendering **their snapshotted wording**, not the pool's current
  text), an **empty-pool** state on the pool list and in the builder,
  and an **Activate** action behind `ConfirmDialog` whose copy names the
  version being retired. All under `ProtectedRoute
  allowedRoles={['SYSTEM_ADMIN']}`, reusing `apiFetch`, `ApiError`,
  `NotAuthorized` and the status/code-only `error-messages.ts` contract.
- **i18n**: real `checklistQuestion.*` / `reviewTemplate.*` translations in
  `en`, `es`, `ca`, parity-enforced by `locales.test.ts`. Label maps for
  `elementType`, `ReviewFrequency` and template `status` **ship with their
  pages**, not as a follow-up (`users-minimal-ui` had to patch this in as PR9;
  `community-minimal-ui`'s risk table named it as the thing not to repeat).
- **Docs**: correct `docs/architecture/domain-model-inspections.md`'s
  `text` (i18n key) wording; **close its standing open question about a
  question's wording changing** (§Open questions, "should that force a new
  template version too…") with the snapshot-on-freeze decision, and add the
  snapshot field to its `ReviewTemplateQuestion` description; record the
  `active`-flag deferral.
- Unit, integration and E2E tests per the `inspectable-elements` conventions,
  plus browser verification of every UI criterion (CLAUDE.md).

### Out of Scope

- **`ReviewSession`, `ElementReviewEntry`, `QuestionAnswer`** — all of FR-007.
  Nothing in this slice reads or writes a session. Templates are authored here
  and consumed there.
- **The review scheduling / compliance-calendar service** (FR-007/FR-009).
- **`MANAGE_CHECKLIST_CONTENT` for `MANAGER`** — needs
  `User.managerCapabilities`, which does not exist. Its own slice.
- **Any second `ElementType` value** — `EXTINGUISHER` only, per ADR-008.
- **Per-locale question text** — settled: one canonical text field.
- **A separate `ChecklistQuestion.active` retire flag** — deferred, settled.
- **Any standalone "retire a template" action** — settled: retirement exists
  only as a side effect of activating the successor. No endpoint, no use case,
  no UI control, no permission.
- **Re-snapshotting or back-filling a frozen version's wording** — a frozen
  snapshot is written once, at activation, and is never refreshed, repaired or
  migrated to match later pool edits. There is no "sync wording" path.
- **Seeding the RIPCI Anexo II question set** — settled: the pool ships empty;
  an admin authors it. No fixture data, no import, no starter set.
- **Restoring soft-deleted questions or drafts**, template duplication /
  "clone previous version as a new draft", cross-lineage copy, search,
  pagination, bulk edit, audit logging.
- **Changes to `community`, `inspectable-element`, `maintenance-company`,
  `users` or `auth`** beyond the `Permission` union and the `SYSTEM_ADMIN`
  permission rows. No cross-module guard this time.
- **A global nav bar** — pre-existing gap, carried forward (see Risks).

### Why this scope and not more (ADR-006)

Template versioning looks like scope that could be trimmed to "one live
checklist per type + frequency, no history". It cannot: the audit trail *is*
the entity's stated reason to exist. Without versions, "which questions
constituted the March 2026 quarterly review" has to be reconstructed backwards
from answer rows — the exact weakness `ReviewTemplate` was designed to remove.
Versioning here is the requirement, not a later refinement.

What *is* trimmed is everything the pool and the templates pull behind them:
the session that consumes a template, the calendar that decides when one is
due, the roles that could co-manage the content, and per-locale content. Each
is additive to this shape, not a rework of it.

## Capabilities

### New Capabilities

- `checklist-question-management`: admin CRUD over the global question pool —
  create, list, update, soft-delete — with `elementType` and non-empty
  `frequencies` tagging, and `SYSTEM_ADMIN`-only access.
- `checklist-question-admin-ui`: the `SYSTEM_ADMIN`-gated pool web surface —
  route gating, list with type/frequency rendering, create/edit forms,
  confirmed delete, and the `ApiError → localized message` contract.
- `review-template-management`: draft creation, ordered question selection
  from the pool, activation (freeze + retire predecessor, atomically), the
  one-active-and-one-draft-per-lineage invariants, version assignment, and
  draft soft-delete.
- `review-template-admin-ui`: the versioned-template web surface — list with
  version/status, the builder view for a draft, read-only frozen versions, and
  the Activate confirmation that names the version being retired.

### Modified Capabilities

- `authorization`: the `Permission` union and the `SYSTEM_ADMIN` row of
  `ROLE_PERMISSIONS` gain `checklistQuestion:*` and `reviewTemplate:*`
  (including `reviewTemplate:activate`). Additive and non-breaking; the four
  inert roles remain `[]`.

## Approach

Two new hexagonal modules mirroring
`apps/api/src/modules/inspectable-element/**` file for file — the most
recently reviewed and archived module — with `review-template` importing
`checklist-question`'s exported port for pool reads, the same one-way
dependency `inspectable-element` → `community` already established.

Five proposal-level choices:

1. **Two modules, not one.** They have different lifecycles (soft-delete vs.
   a draft→active→retired state machine) and different invariants. Merging
   them would put a state machine and flat CRUD behind one repository port.
   The dependency is strictly one-way, so there is no DI cycle to trade for.
2. **Flat routes.** `/checklist-questions`, `/review-templates`,
   `PUT /review-templates/:id/questions` (replace the draft's whole ordered
   selection — idempotent, avoids per-row add/remove/reorder endpoints), and
   `POST /review-templates/:id/activate` (an action, not a `PATCH status`, so
   the retire-predecessor side effect is explicit at the API surface, mirroring
   `POST /communities/:id/representatives`). Unlike `inspectable-elements`,
   nothing here is community-scoped, so there is no parent to nest under.
3. **Activation is one atomic write, not check-then-act.**
   Retire-previous + freeze-this must not interleave with a concurrent
   activation, or a lineage ends with two `active` versions. `sdd-design` picks
   the mechanism (partial unique index vs. serialised transaction), but the
   *shape* is settled by `inspectable-elements` design Decision 6 and by
   `maintenance-company` PR7's real check-then-act race — mirror the corrected
   pattern from day one, do not re-ship the known bug.
4. **`ReviewFrequency` is a domain union first, a Postgres enum second** —
   ADR-008, identical to `ElementType`. This is the pattern's second instance
   and the first proof it generalises; a parity test must assert all three
   declarations agree, as `element-type` already does.
5. **A frozen version is self-contained, not a set of pointers.** Activation
   copies each selected question's text into the frozen version; reading a
   frozen template never needs the live pool row for display. This is
   deliberate denormalisation with an audit justification, and it is bought,
   not free — it must be written inside the *same* atomic activation as the
   freeze and the predecessor retirement (choice 3), or a version can end up
   frozen with missing wording. Two things fall out of it: the previously
   flagged "how does a frozen template read a **soft-deleted** question"
   problem **disappears** — there is nothing to read, so the pool repository's
   default `deletedAt IS NULL` filter needs no exception anywhere; and the
   frozen read path stops joining the pool at all, which is also why
   `questionId` must stay non-authoritative for rendering.

### PR chain sketch

Two phases, one `stacked-to-main` chain (project convention, CLAUDE.md), each
PR merging to `main` in order. `sdd-tasks` owns the exact split; this is the
shape, not a contract — the exploration correctly forecasts a >400-line total,
so chaining is expected, not exceptional.

| Phase | Rough PRs | Content |
|---|---|---|
| **A — question pool** | ~1–5 | `ReviewFrequency` three-way declaration + validation schemas; migration; domain + application; infrastructure + presentation + permissions; pool web UI + i18n; E2E |
| **B — template versioning** | ~6–11 | Template + join migration; domain state machine; application (draft / set-questions / activate); infrastructure + presentation; builder + activate web UI + i18n; E2E + docs correction + final checks |

Phase A is independently shippable and useful on its own (a written,
element-typed question pool). Phase B strictly builds on it.

### Deferred to `sdd-spec` / `sdd-design` (do not resolve here)

- Whether `text`, `name` or `order` become Value Objects (ADR-006 addendum —
  decided per slice; `inspectable-elements` said no to all of its fields).
- `frequencies` as a Postgres enum array vs. a join table.
- The one-active-per-lineage mechanism (partial unique index vs. transaction).
- How `version` is represented on an unactivated draft.
- **Where the frozen wording snapshot physically lives** — a `questionText`
  column on `ReviewTemplateQuestion` (nullable while `draft`, written at
  activation) vs. frozen selection rows written only at activation vs. a
  dedicated frozen-questions table. The *requirement* is settled above; only
  the representation is open. Whichever shape is chosen must make "a frozen
  version with a null/absent snapshot" unrepresentable or test-guarded.
- Whether the draft and frozen read paths share one DTO (with wording sourced
  differently) or are two distinct read models — the API must not let a client
  guess wrong about which wording it is looking at.
- Whether the template builder is one page with an inline picker or a
  list + picker route pair.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma`, `migrations/` | Modified | `ReviewFrequency` enum, 3 new models incl. the frozen question-text snapshot, hand-written FKs/indexes/constraints |
| `apps/api/src/modules/checklist-question/**` | New | Domain (entity, `review-frequency.ts`, errors), application (port, 4 use cases, in-memory fake), infrastructure (Prisma adapter extending `soft-deletable.repository.ts`, mapper), presentation (controller, DTOs, error codes), module |
| `apps/api/src/modules/review-template/**` | New | Domain (entity + status transitions, join entity carrying the frozen wording, freeze-time snapshot behaviour, errors), application (port, question-pool reader port, 6 use cases, in-memory fake), infrastructure, presentation, module (imports `ChecklistQuestionModule`) |
| `apps/api/src/app.module.ts` | Modified | Register both modules |
| `apps/api/src/shared/application/authorization/permission.ts` | Modified | Extend `Permission` union (+9) |
| `apps/api/src/modules/auth/infrastructure/authorization/role-permission.checker.ts` | Modified | Grant the new permissions to `SYSTEM_ADMIN` only |
| `packages/validation/src/{checklist-question,review-template}/**` | New | Zod schemas + `reviewFrequencySchema`, shared web/API |
| `apps/web/src/api/{checklist-question,review-template}.ts` | New | Typed calls + mirrored error-code unions |
| `apps/web/src/{checklist-question,review-template}/**` | New | `error-messages.ts`, frequency/status label maps |
| `apps/web/src/pages/ChecklistQuestion{s List,Create,Edit}Page.tsx`, `ReviewTemplates ListPage.tsx`, `ReviewTemplateDetailPage.tsx` | New | 6 pages |
| `apps/web/src/App.tsx` | Modified | Role-gated routes, static-before-dynamic ordering |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Real translations + label maps |
| `apps/api/test/**` | New | `checklist-question.e2e-spec.ts`, `review-template.e2e-spec.ts` |
| `docs/architecture/domain-model-inspections.md` | Modified | Fix `text` (i18n key) wording; close the standing "a question's wording changed" open question with snapshot-on-freeze; add the snapshot to §ReviewTemplateQuestion; record the `active` deferral |

Untouched by design: `modules/community/**`, `modules/inspectable-element/**`,
`modules/maintenance-company/**`, `modules/users/**`, and `modules/auth/**`
beyond the permission rows. Unlike `inspectable-elements`, this slice adds no
cross-module delete guard.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Scope creep toward FR-007.** A template with no session to run it feels incomplete, and `ReviewSession` is fully sketched in the domain doc | High | Explicit non-goal. `sdd-verify` asserts no `ReviewSession`/`ElementReviewEntry`/`QuestionAnswer` table, model or route exists |
| **Two new modules + 6 pages blows the 400-line PR budget** | High | Two-phase chain sketched above; `sdd-tasks` must forecast explicitly and slice `stacked-to-main`. Phase A ships independently |
| **Activation race leaves two `active` versions in a lineage** — the exact class of bug `maintenance-company` PR7 shipped and PR8 had to fix | Med | Atomic-by-construction is a settled proposal choice (Approach 3), not an implementation detail. `sdd-design` picks the mechanism; `sdd-spec` writes a concurrency scenario with a real integration test, not a vacuous one |
| **A version freezes without its wording snapshot** — the snapshot write is skipped, partially applied, or left null, and a historical template renders blank or silently falls back to live pool text | Med | The snapshot is written inside the same atomic activation as the freeze and the retirement (Approach 3 + 5). `sdd-design` must make the null-snapshot state unrepresentable or test-guarded; success criteria assert wording survives both a later edit *and* a later soft-delete of the source question |
| **The snapshot is added but the frozen read path still joins the live pool "just for convenience"**, quietly reintroducing retroactive wording | Med | `questionId` is provenance-only by decision, not by convention. `sdd-verify` checks the frozen read path does not resolve text through the pool; a test edits a question after activation and asserts the frozen version is byte-identical |
| **`ReviewFrequency` drift across Postgres / domain union / Zod** — three declarations of one truth, and the first time the `ElementType` pattern is generalised | Med | Copy `element-type.ts`'s `as const satisfies` gate and its runtime parity integration spec; a test asserts all three agree |
| **Frozen-template immutability is enforced only in the UI**, letting the API mutate an `active` version | Med | Immutability is domain-layer behaviour, not a controller check. E2E asserts `PUT /review-templates/:id/questions` on an `active` template returns a coded 409 |
| **`ReviewFrequency` / status rendered raw in the UI** — `users-minimal-ui` shipped raw `Role` text and had to patch it | Med | Label maps ship with their pages; grep-checked by `sdd-verify` |
| **Single canonical question text turns out wrong** for a Catalan- or Spanish-speaking community while the app already ships 3 locales | Low | Settled with the product owner, not assumed. Adding per-locale text later is additive for the *live pool*; frozen versions keep the single text they were frozen with, which is the correct audit answer rather than a retrofit debt. The snapshot decision makes this risk cheaper, not dearer |
| **No global nav bar** — these are the 5th and 6th URL-only sections, and unlike `inspectable-elements` there is no parent page to hang an entry point from | Med | Pre-existing gap carried forward from `community-minimal-ui` Open Q8, `maintenance-company` Open Q9 and `inspectable-elements` Open Q7. Worse here than before; still explicitly out of scope, and now overdue enough to name as its own slice |
| **Empty pool reads as a broken feature** on first use, since no seed data ships and the builder has nothing to offer | Low | Deliberate decision; explicit empty states on the pool list and in the builder are in scope, and the empty-pool → first-question → first-template path is part of the browser verification, not an afterthought |
| ES/CA translations stubbed with English placeholders | Med | Real translations in scope; `locales.test.ts` parity guard extends to the new key namespaces |

## Rollback Plan

Revert the branch and roll back the migrations (`prisma migrate reset` in dev),
dropping `ReviewTemplateQuestion`, `ReviewTemplate`, `ChecklistQuestion` and
the `ReviewFrequency` enum, with their FKs, indexes and the active-uniqueness
constraint.

Almost everything is purely additive and self-contained: two new API modules,
two new validation sub-packages, six new pages, two new
`apps/web/src/**` folders, new locale keys, one `Permission` union extension
and new entries on the `SYSTEM_ADMIN` row. Nothing in this slice changes
existing behaviour — no cross-module guard, no signature change to a shipped
port. `app.module.ts` (two imports + two array entries) and `App.tsx` (routes)
are mechanical. The `domain-model-inspections.md` correction is a docs edit,
safe to keep even if the code is reverted.

Reverting restores current behaviour verbatim; any questions or templates
authored during the slice's life are lost with the tables, and nothing else
references them. If the chain is split as sketched, each PR reverts
independently, with the two migration PRs the only ones carrying schema state
— and Phase A reverts cleanly without Phase B, though not the reverse.

## Dependencies

- None new. Reuses `IdGenerator` (UUIDv7, ADR-009), `SoftDeletableRepository`
  (ADR-010), `ZodValidationPipe`, `buildCodedError`, `AuthenticatedGuard` +
  `PermissionsGuard` + `@RequirePermission`, `apiFetch` / `ApiError`,
  `ProtectedRoute allowedRoles`, `NotAuthorized`, `ConfirmDialog`.
- `ElementType` from `@sf-manager/validation` and
  `modules/inspectable-element/domain/element-type.ts` — **read only**, as the
  reference pattern and the shared enum. `inspectable-element` is not modified.
  If `ElementType` must move to a shared location to avoid a module-to-module
  import for a pure type, that is a reportable finding for `sdd-design`, not a
  silent refactor.
- Reachable PostgreSQL for the migrations.
- A running dev server (`npm run dev`) and an authenticated `SYSTEM_ADMIN`
  session for the browser verification CLAUDE.md requires.

## Success Criteria

- [ ] `SYSTEM_ADMIN` can create, list, update and soft-delete a
      `ChecklistQuestion` with `elementType`, a non-empty `frequencies` set and
      free-text `text` — via API and via the web UI.
- [ ] A question's text can be edited at runtime with no code change and no
      deploy; the UI renders it verbatim, never through `t()`.
- [ ] Creating a question with an empty `frequencies` set is rejected.
- [ ] `SYSTEM_ADMIN` can create a `draft` template for an
      `(elementType, frequency)`, select and order questions from the pool, and
      change that selection any number of times while it is a draft.
- [ ] A second `draft` for the same `(elementType, frequency)` is rejected
      while one exists.
- [ ] The template builder pre-filters suggestions by the template's frequency
      but still allows selecting a question tagged only for another frequency.
- [ ] Activating a template freezes it: any subsequent question-selection,
      reorder or rename attempt is rejected with a coded 409, from the API —
      not only hidden in the UI.
- [ ] Activating a template retires the previously `active` version for that
      `(elementType, frequency)` in the same operation, leaving **exactly one**
      `active` version — asserted under concurrent activation, not only
      sequentially.
- [ ] Activating a template with zero questions is rejected; no version number
      is consumed.
- [ ] A discarded draft leaves **no gap** in the lineage's activated version
      sequence.
- [ ] A `retired` template cannot be re-activated or edited.
- [ ] **Editing a question's text after a template was activated does not
      change what that frozen template displays** — the frozen version renders
      the wording as of its activation, byte for byte, while the pool list and
      any open draft show the new text.
- [ ] A frozen version's wording is written as part of the activation itself:
      no activated version can exist with a missing or empty snapshot.
- [ ] A draft renders **live** pool text and reflects question edits
      immediately; the snapshot is taken only at activation.
- [ ] Soft-deleting a question succeeds even when frozen templates reference
      it; those templates still display its frozen wording — **without** the
      pool repository's default `deletedAt IS NULL` filter being bypassed
      anywhere — and it is removed from any draft that had selected it.
- [ ] No API route, use case, permission or UI control retires a template
      without activating a successor.
- [ ] The app ships with an empty question pool: no seeded questions,
      no fixture migration, and both the pool list and the builder show a
      usable empty state.
- [ ] Soft-deleted questions never appear in the pool list or in the builder's
      selectable set.
- [ ] `ROLE_PERMISSIONS` still maps `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
      `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` to `[]`, and
      `PermissionChecker.can`'s signature is unchanged.
- [ ] Unauthenticated requests get 401; authenticated non-`SYSTEM_ADMIN`
      requests get 403; the web app shows the explicit `NotAuthorized` surface,
      not a redirect.
- [ ] `ReviewFrequency` and template `status` are rendered through i18n label
      maps, never as raw `QUARTERLY` / `draft`, in all three locales.
- [ ] No client code compares against a server-supplied English message;
      `error-messages.ts` reads only `ApiError.status` and `.code`, guarded by
      a differential unit test and a `.message` grep.
- [ ] Zero hardcoded UI strings; `checklistQuestion.*` / `reviewTemplate.*`
      keys have real `en`/`es`/`ca` translations, parity test-enforced.
- [ ] `ReviewFrequency`'s three declarations (domain union, Postgres enum, Zod
      schema) are proven to agree by a parity test.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] No `ReviewSession`, `ElementReviewEntry` or `QuestionAnswer` table,
      model, route or page exists.
- [ ] `docs/architecture/domain-model-inspections.md` no longer describes
      `ChecklistQuestion.text` as an i18n key, and its open question about a
      question's wording changing is closed with the snapshot decision.
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server,
      not only test-verified (CLAUDE.md "Verifying UI Changes").

## Open Questions / Deferred

**No open product questions remain.** The proposal question round closed on
2026-09-02: single canonical question text, snapshot-the-wording on freeze
(a reversal of this proposal's earlier assumption — see the settled-decisions
table), an empty pool with no seed data, and retirement only ever as a side
effect of activation. All four are now inputs to `sdd-spec`/`sdd-design`, not
questions. Working out the snapshot data shape surfaced **no new product
questions** — it removed one design item (the soft-deleted read-back path) and
replaced it with a representation choice that belongs to `sdd-design`.

What remains below is deferred work with an explicit revisit trigger, not
anything blocking this slice.

| # | Item | Status | Owner |
|---|---|---|---|
| 1 | **Per-locale question text.** The app ships `en`/`es`/`ca` and `Community` already carries a `locale`. | **Deferred, settled.** One canonical text ships; the locales govern chrome, not admin-authored content. Additive later for the live pool, and frozen versions correctly keep the text they were frozen with. *Revisit trigger*: the first community that cannot read the canonical language. | Future slice |
| 2 | **A separate `ChecklistQuestion.active` retire flag** alongside `deletedAt`. The domain doc lists it; ADR-010 explicitly permits both. | **Deferred, settled.** Identical reasoning to `inspectable-elements`' call on `InspectableElement.active`: with frozen templates carrying their own wording, "retired" and "deleted" produce no observably different behaviour today. *Revisit trigger*: an admin needs a question visible in the pool UI, marked as legacy, but not offered when building a new template. | Future slice |
| 3 | **Discontinuing an `(elementType, frequency)` lineage.** Settled that retirement is only ever a side effect of activation, so a lineage can never be emptied. | **Deferred, settled.** Nothing consumes templates yet, so an unwanted active template is harmless until FR-007. *Revisit trigger*: an element type + frequency combination is discontinued and must stop offering a checklist — a scheduling concern, to be solved there rather than by adding a retire action here. | FR-007 slice |
| 4 | **`MANAGE_CHECKLIST_CONTENT` for `MANAGER`.** The half of FR-005/005b this slice does not satisfy. | **Deferred, settled.** `User.managerCapabilities` has never been built. Fourth consecutive slice to defer it, now confirmed deliberately rather than by inheritance — the backlog is real and getting older. | Future slice |
| 5 | **No global nav bar / no in-app entry point**, now with six URL-only admin sections and no parent page to hang these two from. | **Pre-existing gap, out of scope, escalating — carried forward, not solved here.** Carried from `community-minimal-ui` Open Q8, `maintenance-company` Open Q9 and `inspectable-elements` Open Q7. This is the first slice where the gap actively degrades the feature: an admin has no in-app path to the checklist screens at all. **Follow-up recommendation: schedule it as its own small slice next**, after this one lands. | Future slice |

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel, with **no
blocking product input outstanding**. `sdd-spec` writes the settled decisions
above as already-decided requirements across the four new capabilities plus
the `authorization` delta, and must state the freeze-time wording snapshot as
a requirement in its own right, not as an implementation note. `sdd-design`
owns the `ReviewFrequency` three-way declaration seam, the atomic activation
mechanism (freeze + retire predecessor + write snapshot, one transaction), the
snapshot's physical representation, `version` representation on a draft, the
draft-vs-frozen read models, and the builder UI shape.
