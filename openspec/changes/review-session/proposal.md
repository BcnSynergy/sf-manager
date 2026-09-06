# Proposal: Perform a Review Session

## Intent

FR-007 is the payoff slice. Everything shipped so far builds the inputs and
none of it produces the artifact the business actually sells: a performed
review. Communities exist, elements are registered and physically labelled,
checklist questions are pooled and frozen into versioned templates — and there
is still no way for anyone to walk a building and record that an extinguisher
was checked.

Nothing of the review workflow exists yet. Verified by direct read:
`apps/api/prisma/schema.prisma` declares `Community`, `InspectableElement`,
`ChecklistQuestion`, `ReviewTemplate` and `ReviewTemplateQuestion` — no
`ReviewSession`, no `ElementReviewEntry`, no `QuestionAnswer`, and no module
under `apps/api/src/modules/review-session/**`. This is a from-scratch slice,
not an extension.

Success looks like: a `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE`
logs in, opens a session against a community they are assigned to for one
element type, walks the building typing each element's `code` off its label,
answers that element's frozen questions, and completes the session — with the
answers persisted and the session resumable if they leave mid-walk.

Two upstream dependencies changed state since `sdd/review-session/explore`:

| Gap from exploration | Status today |
|---|---|
| `InspectableElement.code` missing | **CLOSED.** FR-006 (`label-printing`) shipped and archived 2026-09-05. `code` is live: `String @unique @db.VarChar(10)`, application-generated (`schema.prisma:194`). The exploration's interim element-picker recommendation is obsolete — this slice identifies elements by their real `code`. |
| `InspectableElement.active` missing | **OPEN, closed here.** This slice adds it — it is the first slice that needs to exclude an element from new reviews while keeping its history. |
| No resource-scoped authorization | **OPEN, closed here.** `role-permission.checker.ts` still maps `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` to `[]`, and `PermissionChecker.can(role, permission)` still has no resource parameter. Four prior slices deferred this. FR-007 cannot function without it. |

Per ADR-006's 2026-08-25 addendum the minimal web UI ships **in this change**.
Fifth slice under that rule; this is also the first web route in the app
reachable by a non-`SYSTEM_ADMIN` role — every route in `App.tsx` today is
`allowedRoles={['SYSTEM_ADMIN']}`.

Context: `[[sdd/review-session/explore]]`,
`[[sdd/review-session/product-decisions]]`,
`openspec/changes/archive/2026-09-04-checklist-management/`,
`openspec/changes/archive/2026-09-05-label-printing/`, ADR-006, ADR-009,
ADR-010, ADR-011, ADR-013, ADR-014, ADR-015,
`docs/architecture/domain-model-inspections.md`,
`docs/requirements/functional-requirements.md` FR-007.

## Settled product decisions

Closed with the product owner before this proposal
(`[[sdd/review-session/product-decisions]]`). Inputs, not open items — do not
re-litigate in `sdd-spec`/`sdd-design`.

| Decision | Resolution |
|---|---|
| **Element identification: the real `code`** | The technician enters an element's `code` and the system resolves it. **No interim community-scoped picker** — that recommendation predates FR-006 and is superseded. FR-007's own wording ("scan/enter each element's `code`") is now literally satisfiable. |
| **Actors: both non-admin roles, day one** | `MAINTENANCE_TECHNICIAN` **and** `COMMUNITY_REPRESENTATIVE` can open, perform and complete sessions, through the **same UI flow** — no simplified representative variant. Both roles are activated in `ROLE_PERMISSIONS` for the first time. |
| **Sessions are pausable and resumable** | A session persists an in-progress (`draft`) state across visits. Each answered element is durable the moment it is recorded; there is no atomic all-or-nothing submit at the end. This is the field reality — a building walk spans breaks, and a dropped phone must not discard an hour of work. |
| **Unknown code: reject, persist nothing** | A code that matches no element — or matches an element outside this session's community or element type — is rejected with a clear, actionable error. Nothing is written, the session is untouched, the user retries. **No audit or logging mechanism** is added for failed lookups in this slice. |
| **Partial completion is allowed** | A session can be marked `completed` without covering every active element of its element type. Real buildings have locked rooms and blocked access; forcing 100% coverage would either block completion or push technicians to fake answers. |
| **Unreviewed elements need an `observations` reason** | New requirement from the decision round: when an element is left unreviewed, the reason must be captured in an `observations` field. **Where that field lives is deliberately NOT decided here** (on `ElementReviewEntry` as a skip reason, session-level free text, or both) — see *Deferred to `sdd-spec`/`sdd-design`*. It changes the entity shape, so it is a design call, not a proposal call. |
| **`InspectableElement.active`: add it now** | This is the revisit trigger `inspectable-elements` named and `label-printing` explicitly declined ("`active` means keeps its history but stops appearing in **new reviews** — a concept with no referent until `ReviewSession` exists"). That referent now exists. |
| **Offline: explicit non-goal** | Connection is assumed. No offline queue, no local persistence, no sync/conflict resolution. No offline infrastructure exists anywhere in this monorepo; building it now would be speculative per ADR-006. |
| **No compliance calendar / "what's due"** | The RIPCI scheduling service (quarterly cadence, 12-month maximum `ANNUAL` gap) is **deferred to FR-009**. Session creation ships without any due-date nudge, overdue list or reminder. |

## Scope

### In Scope

**Persistence (`apps/api/prisma/`)**

- Three new models — `ReviewSession`, `ElementReviewEntry`, `QuestionAnswer` —
  plus their enums (`ReviewSessionStatus`, `AnswerValue` with
  `YES|NO|NOT_APPLICABLE`). UUIDv7 PKs from the app (ADR-009); cross-module FKs
  hand-written in `migration.sql` and invisible to Prisma (ADR-013), following
  the six existing precedents.
- **No `deletedAt` on any of the three** — ADR-010's stricter rule for review
  records.
- A decommission/active state on `InspectableElement`, with a hand-written
  backfill marking every existing row active.

**Domain (`apps/api/src/modules/review-session/domain/`)**

- The three entities and the invariants that make them trustworthy: a session
  is scoped to exactly one community and exactly one frozen template;
  `elementType`/`frequency` are **derived from the template, never duplicated**
  on the session (domain-doc rule, inherited not redesigned); a session with
  `status != draft` is **immutable** — no edit, no reopen, no soft delete, no
  hard delete, enforced at the domain layer (ADR-010).
- Only a `draft` session may be discarded.

**Application (`apps/api/src/modules/review-session/application/`)**

- Use cases for: open a session, resolve a `code` to an element within the
  session's scope, record an element's answers, mark an element unreviewed with
  its reason, resume an open session, and complete a session.
- The repository port + in-memory fake, mirroring the shipped module shape.

**Authorization — the first resource-scoped check in this codebase**

- New `Permission` values for the review-session surface, and the **first
  activation** of `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` in
  `ROLE_PERMISSIONS` (both are `[]` today).
- A **composable community-scope check layered on top** of the existing
  role/permission check, per ADR-011 Decision 3. `PermissionsGuard` reads only
  `request.user.role` — it cannot see a resolved element or session — so the
  scope check is a separate concern, not a guard extension. Its exact placement
  is `sdd-design`'s call.
- Scope resolution reads through `CommunityTechnicianRepository` and
  `CommunityRepresentativeRepository`. **Both need new by-user query methods** —
  neither port exposes one today (technician has no by-user query at all;
  representative has only `countActiveByUser(): Promise<number>`).

**Read dependencies on shipped modules**

- `ReviewTemplateRepository`: a new query for the currently `active` template of
  an element type — `findById` / `findAll` / `findDraftWithLiveQuestions` /
  `findFrozenWithSnapshot` are all that exist, none filters by status or
  element type. `findFrozenWithSnapshot` is reused to render the **frozen
  snapshot wording**, never the live question pool (the invariant
  `checklist-management` PR 11 closed).
- `InspectableElementRepository`: a **new by-code lookup**. Today every read is
  community-scoped (`findByIdInCommunity`, `findAllByCommunity`); `code` is
  **globally unique**, so a raw by-code lookup crosses community boundaries by
  construction and **must** be scope-checked before anything is returned.

**Web (`apps/web/`)**

- A minimal review-session flow: open a session (choose community + element
  type) → enter an element `code` → answer that element's questions → repeat →
  pause or complete. Plus resuming an open session.
- The first `ProtectedRoute allowedRoles={['MAINTENANCE_TECHNICIAN',
  'COMMUNITY_REPRESENTATIVE']}` routes in `App.tsx`, and whatever minimum
  landing/entry point those roles need to reach them (they currently land on an
  app where every route rejects them).
- A minimal `SYSTEM_ADMIN` control to decommission/reactivate an element,
  reusing the existing `inspectableElement:update` permission — see *Why this
  scope*.

**Cross-cutting**

- Shared Zod schemas in `packages/validation` (ADR-015) for the new request
  shapes, reusing the shipped `code` format schema.
- Real `en`/`es`/`ca` translations, parity-enforced by `locales.test.ts`
  (ADR-007).
- Docs: correct `docs/architecture/domain-model-inspections.md` — the
  `CommunityMaintenanceAssignment` join entity it describes **never shipped**;
  technician scope resolves through `CommunityTechnicianRepository`'s direct
  `(communityId, userId)` assignment. Record `active` and the `observations`
  decision there too.
- Unit, integration and E2E tests per the established conventions, plus
  **browser verification** of every UI criterion against a running dev server
  (CLAUDE.md) — including at least one non-admin login.

### Out of Scope

- **Camera / device QR scanning.** The technician **types** the code printed on
  the label. FR-006 shipped a QR *renderer*, not a scanner; camera capture is a
  new dependency, a permissions prompt and a device-API surface. Manual entry
  proves the whole workflow; scanning is an additive UI swap later, with zero
  schema or API impact. *Executor scope call — see the question round.*
- **Offline capability** of any kind (settled non-goal).
- **The compliance calendar** — no "what's due", no overdue list, no reminders,
  no scheduling service (FR-009).
- **Review history views** (FR-008) — no per-element or per-community history
  page, no cross-session queries, and no `MANAGER` / `MAINTENANCE_COMPANY_MANAGER`
  visibility rules. Those two roles stay `[]`.
- **Signing and export** (FR-010) — no transition to `signed`, no document
  generation, no PDF. Whether the status enum declares `signed` upfront is a
  `sdd-design` detail; **no code path reaches it**.
- **Editing or reopening a completed session** — forbidden by ADR-010, asserted
  as a requirement, not merely unimplemented.
- **Photos, attachments, free-text notes per answer, defect/incident records,
  or corrective actions.**
- **Notifications** of any kind.
- The still-deferred **community batch label sheet** (FR-006's other half).
- **Any change to** `modules/maintenance-company/**`, `modules/users/**`, or the
  authentication mechanism itself. `modules/auth/**` changes only in its
  authorization layer.

### Why this scope and not more (ADR-006)

This slice is already carrying three genuinely new things at once: three new
entities, the codebase's **first resource-scoped authorization mechanism**, and
the **first non-admin-reachable UI**. That is the irreducible core of FR-007 —
remove any one and the feature does not work. Everything adjacent (history,
scheduling, signing, scanning, offline) is separable and separately valuable,
and every one of them has its own FR.

One scope call needs defending, because it is an addition rather than a
deferral: **`InspectableElement.active` ships with a way to set it.** A field
that nothing can write is dead weight — it makes the "only active elements are
expected in a session" rule vacuous and unverifiable end to end, which is
exactly the speculative design ADR-006 warns against. So one minimal admin
control ships with the column. No bulk decommission, no reason field, no
decommission history — the smallest thing that makes the field real.

## Capabilities

### New Capabilities

- `review-session-management` — opening a session against a community and a
  frozen active template, resolving an element by `code` within scope,
  recording answers, marking an element unreviewed with a reason, resuming, and
  completing. Includes the immutability rule for non-`draft` sessions.
- `review-session-ui` — the field flow: open → enter code → answer → repeat →
  pause/complete, and resume.

### Modified Capabilities

- `authorization` — the review-session permissions; `MAINTENANCE_TECHNICIAN`
  and `COMMUNITY_REPRESENTATIVE` become operational for the first time; and the
  **resource-scope rule**: holding a review-session permission grants nothing on
  a community the user is not actively assigned to. This is a requirement in its
  own right, not an implementation detail.
- `inspectable-element-management` — elements gain an active/decommissioned
  state; decommissioned elements keep their history and their `code` but are not
  expected in new sessions. Adds by-code resolution as a scoped operation.
- `inspectable-element-admin-ui` — a decommission/reactivate control.
- `review-template-management` — resolving the currently `active` template for
  an element type becomes a supported query.

## Approach

Build a new `apps/api/src/modules/review-session/**` module following the
established hexagonal mirror (`domain/`, `application/{ports,use-cases}`,
`infrastructure/persistence/`, `presentation/`). The three entities form one
aggregate rooted at `ReviewSession` and belong together in one module; the
authorization work extends `modules/auth/**`'s authorization layer in place.

Five proposal-level choices:

1. **Answers are persisted as they are recorded, not batched at the end.**
   Directly implied by pausable/resumable. It also makes the session's own
   status the only completion signal, and keeps the write path small and
   independently testable per element.

2. **Resource scope is a separate composable check, not a wider
   `PermissionChecker.can()`.** ADR-011 Decision 3 already anticipates this
   shape, and the code agrees: `PermissionsGuard` only ever sees
   `request.user.role`, so widening `can()` would force resource identity into a
   guard that cannot resolve it. Keeping the scope check separate also leaves
   the existing exhaustive `Record<Role, Permission[]>` table — and its
   build-breaking exhaustiveness guarantee — untouched.

3. **By-code lookup is scope-checked, never a bare global read.** `code` is
   globally unique across the installation. A `findByCode(code)` that returns
   before a scope check would let any technician enumerate other companies'
   communities by guessing 10-character codes. The lookup must be constrained by
   the session's community and element type, and the failure must be
   indistinguishable from "no such code" — a distinct "exists but not yours"
   error is itself the leak.

4. **The session renders the template's frozen snapshot, never the live pool.**
   Inherited invariant, not a new decision — `checklist-management` PR 11 closed
   it. A completed session must be readable years later exactly as it was
   answered, even after the question pool moves on.

5. **Manual code entry, camera scanning deferred.** The workflow, the scope
   rules and the persistence are all identical either way; scanning changes one
   input control. Proving the hard parts first and swapping the input later is
   strictly cheaper than bundling a device-API dependency into the largest slice
   this project has attempted.

### PR chain sketch

One `stacked-to-main` chain (project convention, CLAUDE.md), branches
`review-session/<NN>-<slug>`, PR titles `feat(review-session): PR N/M — ...`,
each merging to `main` in order. **This slice is structurally larger than any
prior one** — `sdd-tasks` owns the exact split and must forecast against the
400-line budget; expect a longer chain than `label-printing`'s four. This is
the shape, not a contract.

| PR | Content |
|---|---|
| ~1 | `InspectableElement` active state: migration + backfill, entity, mapper, DTO, admin control |
| ~2 | Scoped-authorization foundation: new permissions, role activation, the scope-check abstraction, new by-user repository methods on both assignment ports |
| ~3 | Review-session schema + migration + domain entities and invariants |
| ~4 | Open/resume session use cases + template resolution query + endpoints |
| ~5 | By-code resolution (scope-checked) + record answers + mark unreviewed |
| ~6 | Complete session + immutability enforcement + E2E |
| ~7 | Web flow: routes, pages, i18n |
| ~8 | Docs correction, browser verification (including a non-admin login), final checks |

PRs ~1–2 are independently shippable and independently valuable: elements
become decommissionable, and the authorization mechanism lands with focused
review before any domain complexity is layered on it.

### Deferred to `sdd-spec` / `sdd-design` (do not resolve here)

- **Where `observations` lives** and whether it is mandatory — on
  `ElementReviewEntry` as a per-element skip reason, session-level free text, or
  both. Flagged explicitly by the decision round as a design call. It changes the
  entity shape, so it must be settled before `sdd-tasks`.
- **How an unreviewed element is represented**: an `ElementReviewEntry` with no
  answers and a reason, versus absence of an entry. Determines whether "which
  elements were skipped" is a stored fact or a computed diff.
- **The exact shape of the active state** — a `boolean active` versus a
  `deactivatedAt DateTime?` following the shipped `CommunityTechnician` /
  `CommunityRepresentative` precedent (`NULL = active`), and how it composes with
  `deletedAt`.
- **Where the scope check executes** — a decorator + enriched guard, an
  application-layer service injected into use cases, or a repository-level
  constraint — and whether it deserves an ADR-011 addendum.
- Whether a session stores its resolved template version explicitly or derives
  it through the template FK.
- Whether the status enum declares `signed` upfront.
- Value Objects versus plain fields for the new entities (ADR-006 addendum —
  decided per slice; `installed-at.ts` chose pure functions).
- Endpoint shapes and route nesting (ADR-014), and whether the web flow is one
  route with steps or several routes.
- Whether the web flow fetches the frozen questions once per session or per
  element.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma`, `migrations/` | Modified | 3 new models + 2 enums, hand-written FKs/indexes; `InspectableElement` active state + backfill |
| `apps/api/src/modules/review-session/**` | New | The whole module: domain, application, infrastructure, presentation |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modified | New permissions; `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` cease to be `[]` |
| `shared/application/authorization/permission.ts` | Modified | New `Permission` union members |
| `.../auth/application/ports/**`, `.../auth/presentation/guards/**` | Modified/New | The composable resource-scope check (placement is `sdd-design`'s) |
| `.../community/application/ports/community-technician.repository.port.ts` | Modified | New by-user query — none exists today |
| `.../community/application/ports/community-representative.repository.port.ts` | Modified | New by-user query — only `countActiveByUser` exists today |
| `.../community/infrastructure/persistence/**` | Modified | Adapters for the two new methods |
| `.../review-template/application/ports/review-template.repository.port.ts` | Modified | Active-template-by-element-type query |
| `.../inspectable-element/application/ports/inspectable-element.repository.port.ts` | Modified | Scope-constrained by-code lookup |
| `.../inspectable-element/domain/inspectable-element.entity.ts` | Modified | Active state |
| `.../inspectable-element/**` (mapper, use cases, DTOs, module) | Modified | Active state end to end |
| `packages/validation/src/review-session/**` | New | Shared request schemas |
| `apps/web/src/pages/ReviewSession*.tsx` (names TBD) | New | The field flow |
| `apps/web/src/App.tsx` | Modified | First non-`SYSTEM_ADMIN` routes |
| `apps/web/src/pages/CommunityElementsListPage.tsx` / element edit form | Modified | Decommission control |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Real translations |
| `apps/api/test/*.e2e-spec.ts` | New/Modified | Session lifecycle, scope enforcement, immutability |
| `docs/architecture/domain-model-inspections.md` | Modified | `CommunityMaintenanceAssignment` drift correction; `active`; `observations` |

Untouched by design: `modules/maintenance-company/**`, `modules/users/**`,
`modules/checklist-question/**`, and the authentication mechanism
(`AuthenticatedGuard`, token issuance, login).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **The scope check is bypassed on one path.** The first scoped-auth mechanism in the codebase, applied across several new endpoints; one endpoint that forgets it exposes another company's data | High | Design the check as a single composable unit that is hard to omit rather than a copy-pasted call; E2E asserts a `403`/not-found for **every** review-session endpoint with a correctly-authenticated but unassigned user — one test per endpoint, no representative sampling |
| **Cross-community leakage through by-code lookup.** `code` is globally unique; a bare `findByCode` crosses every boundary in the system | High | Approach choice 3: the lookup is constrained by the session's community and element type, and the "not yours" response is indistinguishable from "no such code". E2E proves a valid foreign code behaves exactly like a nonsense code |
| **Slice size overwhelms review.** Three new entities + first scoped auth + first non-admin UI in one change — larger than any prior slice | High | Chained `stacked-to-main` PRs planned from the outset; `sdd-tasks` must forecast against the 400-line budget; PRs ~1–2 are independently shippable so the riskiest mechanism gets isolated review |
| **`ReviewSession` immutability leaks.** A generic update endpoint, an incautious repository `updateById`, or a "just reopen it" convenience makes a completed review editable | Med | Enforced at the domain layer, not only at the controller; asserted as an explicit requirement; E2E attempts to mutate a completed session and to delete it, expecting rejection in both cases |
| **Draft sessions accumulate with no way to discard them.** Resumable sessions plus no discard path means abandoned walks linger forever, and a technician may not be able to start a fresh session for the same community/template | Med | Raised in the question round; `sdd-spec` must state whether a discard path ships and whether concurrent drafts for the same (community, template) are allowed — this is a product rule, not an implementation detail |
| **`observations` gets decided by accident.** The field's location is undecided; the first developer to touch the entity will implicitly settle it | Med | Named as a blocking `sdd-design` decision here; `sdd-tasks` must not start until it is written into the spec |
| **The frozen snapshot is bypassed** and a session renders live question wording, silently changing what a past review means | Med | `findFrozenWithSnapshot` is the only permitted read path; a test asserts that editing the live pool after a session opens does not change the session's rendered questions |
| **Non-admin users land in a dead app.** Both roles have never had a reachable route; logging in as one today rejects everything | Med | An entry point for the two roles is in scope; browser verification explicitly includes a non-admin login, not only a `SYSTEM_ADMIN` walkthrough |
| **`active` ships unsettable** and the "only active elements" rule becomes vacuous | Med | A minimal admin control ships with the column (see *Why this scope*); flagged for product-owner confirmation |
| **Scope creep into FR-008/FR-009/FR-010.** Sessions exist, so history, due dates and signing all "obviously" follow | High | Explicit non-goals; `sdd-verify` asserts no history route, no scheduling service, no `signed` transition and no export exists |
| **The domain-model doc drifts a fifth time** — it still describes a `CommunityMaintenanceAssignment` entity that never shipped | High | Doc correction is in scope, following `checklist-management` PR 11's precedent |
| ES/CA translations stubbed with English placeholders | Med | Real translations in scope; `locales.test.ts` parity guard extends to the new keys |

## Rollback Plan

Revert the branch and roll back the migrations (`prisma migrate reset` in dev).
The three review tables and the active column drop with them; any recorded
sessions are lost with the tables, which is the one part a `git revert` cannot
undo — a deployment-sequencing concern, not a code one. **Do not let real
reviews be performed against this slice until it is verified.**

The authorization change is the other asymmetric part: it is the first slice to
grant any permission to a non-admin role. Reverting returns both roles to `[]`,
which is the current, safe state — the failure direction is closed, not open.

Everything else is additive: a new module, new ports and adapters, new pages
and routes, new locale keys. Changes to existing files are narrow — new methods
on three existing ports, one entity field, one list control, new route entries.
No shipped port signature is broken and no existing behaviour changes.

If the chain is split as sketched, each PR reverts independently; PRs ~1, ~3
carry schema state and PR ~2 carries the permission-table change.

## Dependencies

- **FR-006 (`label-printing`) — shipped and archived 2026-09-05.** `code` is
  live and unique. This slice consumes it; it does not modify it.
- **`checklist-management`** — frozen templates and their question snapshots
  must exist for a session to have anything to ask.
- **`community` assignments** — a technician or representative must be actively
  assigned to a community to review it. Both assignment repositories are read
  dependencies and both gain a new query method.
- **No new runtime dependency is anticipated.** Reuses `IdGenerator` (ADR-009),
  `ZodValidationPipe`, `buildCodedError`, `AuthenticatedGuard` +
  `PermissionsGuard` + `@RequirePermission`, `apiFetch` / `ApiError`,
  `ProtectedRoute allowedRoles`, `NotAuthorized`.
- Reachable PostgreSQL for the migrations, with representative existing element
  rows to exercise the `active` backfill against.
- For browser verification: a running dev server, seeded data (a community, an
  active template with frozen questions, labelled elements), **and real
  `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` accounts assigned to
  that community**.

## Success Criteria

**Performing a review**

- [ ] A `MAINTENANCE_TECHNICIAN` assigned to a community can open a session
      against that community's currently `active` template for an element type,
      and a `COMMUNITY_REPRESENTATIVE` assigned to that community can do the
      same through the identical flow.
- [ ] Entering a valid `code` for an active element of the session's community
      and element type resolves that element and presents its questions.
- [ ] The questions presented are the template's **frozen snapshot**; editing
      the live question pool after the session opens does not change them.
- [ ] Each question can be answered `YES`, `NO` or `NOT_APPLICABLE`, and the
      answer is durable immediately — not held until the session ends.
- [ ] A session can be left and resumed later with all prior answers intact.
- [ ] A session can be completed **without** covering every active element, and
      an unreviewed element carries a recorded reason.

**Rejections**

- [ ] A code matching no element is rejected with a clear error and nothing is
      persisted.
- [ ] A code belonging to another community, to another element type, or to a
      decommissioned or soft-deleted element is rejected — and is
      **indistinguishable** from an unknown code in both status and message.
- [ ] A completed session cannot be edited, reopened, answered further, or
      deleted by any role, including `SYSTEM_ADMIN`. Only a `draft` session may
      be discarded.

**Authorization**

- [ ] A technician or representative **not** actively assigned to a community
      cannot open, read, resume or complete a session for it — proven on
      **every** review-session endpoint, not a sample.
- [ ] Deactivating an assignment removes that access on the next request.
- [ ] `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` remain `[]` — no permission
      is granted to either by this slice.
- [ ] `SYSTEM_ADMIN`'s existing permissions are unchanged, and the
      `Record<Role, Permission[]>` table stays exhaustive by construction.
- [ ] Unauthenticated requests get 401; authenticated-but-unauthorized get 403;
      the web app shows `NotAuthorized`, not a redirect.

**Element active state**

- [ ] Every pre-existing element is active after the migration; no row is left
      indeterminate.
- [ ] A `SYSTEM_ADMIN` can decommission and reactivate an element.
- [ ] A decommissioned element keeps its `code` and its history, is not
      expected in a new session, and its code is rejected on entry.

**Scope guards**

- [ ] No review-history route, page, use case or repository query exists
      (FR-008).
- [ ] No scheduling, due-date, overdue or reminder logic exists (FR-009).
- [ ] No code path transitions a session to `signed`, and no export or document
      generation exists (FR-010).
- [ ] No camera/scanner dependency, no offline storage, no service worker, and
      no sync logic was added.
- [ ] No `deletedAt` column exists on any of the three new tables.

**Quality**

- [ ] Zero hardcoded UI strings; new keys have real `en`/`es`/`ca`
      translations, parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] Hand-written FKs and indexes survive the migrations, proven by an
      integration test reading `pg_indexes` / `pg_constraint`, per the shipped
      precedent.
- [ ] `docs/architecture/domain-model-inspections.md` no longer describes
      `CommunityMaintenanceAssignment` as the technician scoping mechanism.
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server,
      including at least one login as each non-admin role — not only
      test-verified (CLAUDE.md).

## Proposal question round

Five product questions this executor could not put to the product owner
directly. None blocks `sdd-spec`/`sdd-design` — each has a stated working
assumption — but answers may change the proposal.

1. **Does `active` ship with a way to set it?** An unsettable column makes the
   "only active elements" rule unverifiable end to end. *Assumption*: yes, one
   minimal `SYSTEM_ADMIN` decommission/reactivate control on the existing
   element edit surface, reusing `inspectableElement:update` — no new
   permission, no bulk action, no decommission reason or history.

2. **Manual code entry now, camera scanning later — acceptable?** FR-007 says
   "scan/enter". *Assumption*: typing the code printed on the label satisfies
   this slice; camera capture is an additive UI swap with no schema or API
   impact, and bundling a device-API dependency into the largest slice yet is
   the wrong trade. If the field reality is that typing 10 characters per
   element is unworkable, say so now — it changes the web scope materially.

3. **Is an `observations` reason mandatory to complete a session with
   unreviewed elements, or optional?** The decision round settled that the
   reason must be *captured*; it did not settle whether completion is *blocked*
   without one. *Assumption*: mandatory per unreviewed element — a compliance
   record with unexplained gaps is worth less than one that says "sealed room,
   no access". Note this is the product half of the question; **where** the
   field lives stays a `sdd-design` call either way.

4. **Can a technician hold more than one open draft session at a time, and can
   an abandoned draft be discarded?** Resumable sessions with no discard path
   accumulate indefinitely. *Assumption*: at most one open draft per (community,
   template) per user, and discarding a draft ships in this slice. If concurrent
   drafts are expected (a technician alternating between two buildings), that is
   a different invariant and should be stated now.

5. **Who can resume a draft session — only the person who opened it, or anyone
   assigned to that community?** Relevant when a technician goes off shift
   mid-walk. *Assumption*: only the performer resumes their own draft; broader
   visibility is FR-008's concern. If handover between technicians is a real
   workflow, it belongs in this slice's scope rules, not a later one.

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel; no blocking product
input is outstanding.

`sdd-spec` writes the settled decisions above as already-decided requirements
across the new `review-session-management` and `review-session-ui`
capabilities, plus deltas on `authorization`, `inspectable-element-management`,
`inspectable-element-admin-ui` and `review-template-management`. It must state
the **resource-scope rule**, the **indistinguishable rejection** of foreign
codes, the **frozen-snapshot** rule and **completed-session immutability** as
requirements in their own right, not implementation notes.

`sdd-design` owns the `observations` placement (blocking — `sdd-tasks` cannot
start without it), the unreviewed-element representation, the active-state
shape, where the scope check executes and whether it needs an ADR-011 addendum,
the aggregate boundaries and Value-Object calls, and the endpoint and web-route
shapes.

`sdd-tasks` must plan a chained `stacked-to-main` PR sequence from the outset —
this slice will not fit one reviewable PR.
