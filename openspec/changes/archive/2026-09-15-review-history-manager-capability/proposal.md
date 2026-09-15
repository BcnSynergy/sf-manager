# Proposal: Manager Review-History Capability (`VIEW_ALL_REVIEWS`)

## Intent

FR-008's role-based visibility axis has shipped four scopes across three
slices: `MAINTENANCE_TECHNICIAN` own + `COMMUNITY_REPRESENTATIVE` community
(`review-history`, archived 2026-09-09), `MAINTENANCE_COMPANY_MANAGER`
company-wide (`review-history-company-scope`, archived 2026-09-13), and
`SYSTEM_ADMIN` installation-wide (`review-history-admin-scope`, archived
2026-09-14).

This slice builds the **fifth and last one: a `MANAGER` sees every completed
review session in the installation — but only when a `SYSTEM_ADMIN` has
explicitly granted them the `VIEW_ALL_REVIEWS` capability.** Verified today:
`ROLE_PERMISSIONS.MANAGER` is `[]`; `ReviewHistoryAccessService` returns
`[]`/`null` in both `listForActor` and `loadByRole` for this role; the `User`
model has no capability column; and a full-repo search for
`ManagerCapability` / `managerCapabilities` / `VIEW_ALL_REVIEWS` finds only
ADR-011's own text and three specs' *"this MUST NOT exist"* guards.

`MANAGER` is the property-management company's own operator role — the people
who actually answer to the communities. Today the only way to give one of them
installation-wide review oversight is to make them a `SYSTEM_ADMIN`, which
also hands over user creation, community and company CRUD, checklist content,
and template activation. **Read access is only obtainable today as a side
effect of full privilege escalation.** That is the gap, and it is exactly the
gap ADR-011 Decision 2 has promised to close — with this exact signature
(`User.managerCapabilities?: ManagerCapability[]`) — since the role was
declared. This slice is the first implementation of an already-accepted
architectural decision, not a new one.

Success looks like: a `SYSTEM_ADMIN` opens a `MANAGER`'s edit page, ticks
`VIEW_ALL_REVIEWS`, saves. That manager logs in, follows a link from `/`, and
reads **every** completed session in the installation on the same
`/review-history` surface the other four roles already use. Unticking it
revokes access on the **next request**, with no re-login. A manager who was
never granted it is exactly as inert as they are today.

Per ADR-006's 2026-08-25 addendum the minimal web UI ships **in this change**
— here that is one conditional control on an existing form plus role-widening
of already-shipped pages. No new page.

Context: `[[sdd/explore/fr-008-manager-view-all-reviews]]`,
`openspec/changes/archive/2026-09-14-review-history-admin-scope/`,
`openspec/changes/archive/2026-09-13-review-history-company-scope/`,
`openspec/changes/archive/2026-09-09-review-history/`, ADR-006, ADR-010,
ADR-011 **Decision 2** (+ its 2026-08-22 and 2026-09-09 addenda), ADR-013,
FR-003, FR-008.

## Settled scope decisions

Closed with the product owner before this proposal. **Inputs, not open items —
do not re-litigate in `sdd-spec`/`sdd-design`.**

| Decision | Resolution |
|---|---|
| **Granted on edit only, never on creation** | The `VIEW_ALL_REVIEWS` control appears **only** on the user-edit surface (`UserEditPage.tsx`). `UserCreatePage.tsx` is **not** touched. A `MANAGER` is always created inert; granting is a deliberate second act by a `SYSTEM_ADMIN`. The asymmetry with `maintenanceCompanyId` (which appears on both forms) is intentional: a company is an identity fact a maintenance user cannot exist without; a capability is a privilege grant. |
| **Revocable through the same control** | One toggle grants and revokes. No separate grant/revoke endpoint, no extra state, no lifecycle beyond what an ordinary edit-and-save already does. |
| **Role-change hygiene: capabilities are cleared** | When a user's role changes **away** from `MANAGER` to any other role, `managerCapabilities` is cleared as part of that same change. A stale flag MUST NOT silently reappear if the user is later changed back to `MANAGER`. Symmetrically, a payload that sets a capability for a non-`MANAGER` resulting role is rejected. |
| **No audit trail** | Out of scope, deliberately. Consistent with ADR-011 Decision 5 already deferring audit logging for role changes and `SYSTEM_ADMIN` writes generally — role changes are equally unaudited today, so this is existing precedent, **not** a new gap this slice opens. |
| **Array-of-enum on `User`, one member** | `User.managerCapabilities ManagerCapability[]`, enum declaring **only** `VIEW_ALL_REVIEWS`. ADR-011 Decision 2's literal signature; the other five capability names it lists stay undeclared until their own slices (ADR-006). Not a boolean (would need a breaking rename on the second capability), not a grant table (ADR-011 explicitly rejected that shape). |
| **Resolved fresh per request, never from the JWT** | A new checker reads the capability from the database on every request, mirroring `UserCompanyScopeChecker` exactly (same fail-closed shape, same no-cache contract, same free soft-delete filter via `findById`). ADR-011's 2026-09-09 addendum rejected token-carried company scope for the revocation-lag reason; that reasoning applies at least as strongly to a security grant. `Actor` stays `{userId, role}`. |
| **Layer 1 grants broadly, Layer 2/3 gates** | `ROLE_PERMISSIONS.MANAGER` gains `['reviewSession:read']` **unconditionally**, mirroring `MAINTENANCE_COMPANY_MANAGER`'s shipped pattern. The real gate is the new `MANAGER` branch in `ReviewHistoryAccessService`, which returns `[]`/404 when the capability is absent — byte-identical observable behaviour to today **on the review-history read surface**. **Named consequence, not an oversight**: `reviewSession:read` also gates `GET /review-sessions` and `GET /review-sessions/:sessionId` in `review-session.controller.ts` (the draft-resume list and the performer-scoped read) — two routes outside `review-history`'s surface. Granting `MANAGER` this permission unconditionally moves those two routes from 403 to `200 []`/404 for **every** `MANAGER`, granted or not, since neither route consults the capability. This is new read access nobody decided on before this proposal; it is accepted here as the unavoidable shape of an unconditional Layer-1 grant, not silently absorbed into the "byte-identical" claim above, which is scoped to `review-history` only. |
| **The read is `SYSTEM_ADMIN`'s read, verbatim** | A granted `MANAGER` calls `findCompletedAcrossInstallation` / `findCompletedByIdAcrossInstallation` (shipped by `review-history-admin-scope`) unchanged. `VIEW_ALL_REVIEWS` means literally everything, including sessions of deactivated/soft-deleted communities and companies. **No new repository method.** |
| **Only `SYSTEM_ADMIN` grants it — no new permission** | Reuses the existing `user:update` gate on `PATCH /users/:id`. No `user:grantCapability` permission: no second trust tier exists that would hold `user:update` without capability-grant rights, so the granularity would be ungrounded. (`community:assign` vs `community:update` was split because two roles genuinely needed different subsets — not the case here.) |
| **An ungranted `MANAGER` stays exactly as inert as today** | Binding, not aspirational. Three prior slices each shipped a regression guard asserting `MANAGER` reaches nothing; this slice must keep that true for the ungranted case and prove it, not assert it. |
| **Ungranted `MANAGER`'s web experience: link visible, empty result** | The `/review-history*` routes and the `HealthPage` entry link are gated on `role === 'MANAGER'` alone, same as every other role today — NOT on the capability. An ungranted manager reaches the page and sees the normal empty-installation state (already shipped, already tested). `/auth/me` is **not** extended with a DB-read `managerCapabilities` field for UI affordance — the server stays the sole authority, no new surface. (Was Open Question 1; confirmed with the product owner, resolved here rather than left to `sdd-design`.) |

## Scope

### In Scope

**Data model (`apps/api/prisma/`)**

- A `ManagerCapability` enum declaring **exactly one** member,
  `VIEW_ALL_REVIEWS`, plus `User.managerCapabilities ManagerCapability[]`.
- One **additive** migration. Unlike `review-history-company-scope`, there is
  **no backfill**: "no capabilities" is the correct and intended value for
  every existing row, including every existing `MANAGER`.
- Domain/infrastructure plumbing: `UserProps`/`User` entity field,
  `UserMapper`, `UserRepository` port + Prisma adapter + in-memory fake,
  extended per the shipped `prisma-user.repository.integration.spec.ts` and
  migration-integration precedents.

**Capability resolution (new Layer 2 checker)**

- A capability-scope checker port + adapter, shaped after
  `CompanyScopeChecker` / `UserCompanyScopeChecker`: exhaustive `switch` on
  `Role` with a `satisfies never` backstop, non-`MANAGER` roles resolving to
  "no capability", fresh DB read on every call, fail-closed, no cache.

**API read side (`apps/api/src/modules/review-session/`)**

- The `MANAGER` branch in `ReviewHistoryAccessService.listForActor` and
  `loadByRole`, replacing today's `[]`/`null`: resolve the capability, early
  return `[]`/`null` when absent, otherwise call the **existing**
  across-installation methods. The exhaustive `switch` and its
  `satisfies never` backstop stay.
- Same routes (`GET /review-history`, `GET /review-history/:sessionId`), scope
  still resolved entirely server-side from the actor. No new route, no new
  repository method, no port signature change.
- Every shipped invariant holds: completed-only, drafts never surface,
  out-of-scope/nonexistent id → `404 REVIEW_SESSION_NOT_FOUND`.

**Granting (`apps/api/src/modules/users/`, `packages/validation`)**

- `PATCH /users/:id` accepts an optional `managerCapabilities`, gated by the
  existing `user:update` permission. `updateUserSchema` gains the field plus
  the payload-decidable NOT_ALLOWED refinement (capability set on a
  non-`MANAGER` role in the same payload → reject), mirroring
  `applyMaintenanceCompanyNotAllowedRefinement`'s shape.
- A domain policy for the resulting-state rules — capabilities are meaningful
  only for `role = MANAGER`, and a role change away from `MANAGER` clears them
  — applied in `UpdateUserUseCase` against the **resulting** state, the same
  way `isMaintenanceRole(resultingRole)` already is.
- `UserResponseDto` carries the field so the edit form can prefill it (there
  is no `GET /users/:id`; the edit page reads `listUsers()`, per
  `user-admin-ui` design Decision 5).

**Authorization**

- `MANAGER` gains `reviewSession:read` — its **first permission ever**, ending
  the 2026-08-22 addendum's four-inert-roles era — and **nothing else**.
- The new visibility rule as a requirement in its own right: this permission
  **plus** the `VIEW_ALL_REVIEWS` capability grants every completed session;
  the permission alone grants nothing.
- Narrowing (not deleting) the shipped guards that this slice makes false:
  `authorization`'s *"The Deferred Review Visibility Scopes Grant Nothing"*
  **and** *"Non-Admin Roles Remain Inert After the Checklist Permissions Are
  Added"* (whose *"`MANAGER` MUST equal `[]`"* and *"no
  `managerCapabilities` MUST exist"* scenarios both break here — the latter
  must narrow to `MANAGE_CHECKLIST_CONTENT` only), plus the equivalent rows
  and scenarios in `review-history` and `review-session-management`. Per-element
  history and the five undeclared capability names stay explicitly unbuilt.

**Web (`apps/web/`)**

- A `VIEW_ALL_REVIEWS` toggle on `UserEditPage.tsx`, rendered only when
  `role === 'MANAGER'` and cleared on a role change away from it — the exact
  structural shape `showCompanySelector` / `handleRoleChange` already uses for
  `maintenanceCompanyId`. Submitted whenever the current role is `MANAGER`,
  never as a stale value carried across a role change.
- `MANAGER` added to both `/review-history*` routes' `ProtectedRoute
  allowedRoles` (4 roles → 5) and to `HealthPage.tsx`'s
  `REVIEW_HISTORY_ROLES`, reusing `ReviewHistoryPage` /
  `ReviewHistoryDetailPage` unmodified — no manager variant.
- Real `en`/`es`/`ca` translations for every new key, parity test-enforced.

**Documentation + cross-cutting**

- FR-008's status: the role-based visibility axis closes; per-element history
  named as what remains.
- An ADR-011 addendum recording Decision 2's first implementation, the
  one-declared-member scoping, and the not-in-the-JWT resolution choice —
  and explicitly **superseding** Decision 3's current text, which says
  `PermissionChecker` resolves permissions "plus the `managerCapabilities`
  flags above" (implying capability-awareness inside `PermissionChecker`
  itself). This design's Layer 1/Layer 2 split keeps
  `PermissionChecker.can()`'s signature unchanged — no DB read, no
  capability parameter — and resolves the capability in
  `ReviewHistoryAccessService` instead; the addendum must record that as
  the actual, settled shape, or the ADR and the canonical `authorization`
  spec's binding statement that `can()` "MUST NOT perform a database read"
  will disagree with each other after archive.
- Unit, integration (migration + repository against real Postgres), a
  **five-role** E2E visibility matrix widened to distinguish
  MANAGER-without-capability from MANAGER-with-capability, and **browser
  verification** against a running dev server for both manager states
  (CLAUDE.md).

### Out of Scope (non-goals)

- **The other five `ManagerCapability` values** ADR-011 Decision 2 names
  (`MANAGE_COMMUNITIES`, `MANAGE_MAINTENANCE_COMPANIES`,
  `MANAGE_CHECKLIST_CONTENT`, `MANAGE_INSPECTABLE_ELEMENTS`,
  `MANAGE_ORGANIZATION_PROFILE`). The enum is built to hold them cleanly; none
  is **declared**, designed, or implemented here. Each gets its own slice.
- **Audit trail** for capability or role changes (settled decision above).
- **Per-element history** — FR-008's other axis, unrelated to this slice.
- **A separate capability-grant permission or a second grantor role.** Only
  `SYSTEM_ADMIN` reaches `/users/:id/edit` at all today; no
  `MAINTENANCE_COMPANY_MANAGER`-style admin gains grant rights, and no new
  permission layer is built for it.
- **Granting at user creation.** `UserCreatePage.tsx` and `POST /users` /
  `createUserSchema` are untouched.
- **Any narrowing of the granted manager's read.** No per-company,
  per-community or date-bounded variant of `VIEW_ALL_REVIEWS`.
- **Filtering, sorting, pagination, search** — `review-history-ui`'s "No
  Filtering, Analytics or Adjacent Controls Ship" stays in force **unchanged**.
- **Any new repository method or port signature change** on
  `ReviewSessionRepository`.
- **Export (FR-010), signing, PDFs, analytics, notifications.**
- **Any change to the other four roles' visibility**, to the review-session
  write path, or to `SessionAccessService` (byte-unchanged).
- **Demo-mode-specific logic** of any kind.
- **Baking capabilities into the JWT**, or any client-side authorization
  decision derived from them.

### Why this scope and not more (ADR-006)

The capability *mechanism* is the expensive part, and it is paid for exactly
once here: one enum member, one column, one checker. Declaring all six ADR-011
capability names would ship five flags no code reads and no UI can act on —
the "code with no reachable trigger" failure the admin-scope slice explicitly
refused. Adding an audit trail would bolt a new cross-cutting concern onto the
same review as the app's first capability grant. Granting at creation time
adds a second surface for zero product need the success criteria name.

## Capabilities

### New Capabilities

- None. This extends `review-history`, `review-history-ui`, `authorization`,
  `user-management` and `user-admin-ui`; every surface, route, page and
  permission family already exists.

### Modified Capabilities

- `review-history` — add the capability-gated `MANAGER` installation-wide
  visibility as a requirement in its own right (granted ⇒ identical scope to
  `SYSTEM_ADMIN`, including deactivated/soft-deleted context; ungranted ⇒
  nothing); amend the now-false *"Global visibility for `MANAGER`"* deferral
  row and its `ManagerCapability`-must-not-exist scenario (spec.md ~L29, L535,
  L543); confirm *"History Scope Is Carried by the Query, Not by the Caller"*
  still holds when two different roles share one unscoped query.
- `review-history-ui` — add `MANAGER` to *"Role-Gated Route Access for the
  History Views"* and give it a reachable entry point from `/`; state what an
  **ungranted** manager sees; keep the no-filtering guard intact.
- `authorization` — `MANAGER` gains `reviewSession:read`; the new
  permission-plus-capability visibility rule; the installation-wide read is now
  reachable by two roles under different conditions (amending *"The one
  unscoped history read is reachable only by the admin"*); narrow *"The
  Deferred Review Visibility Scopes Grant Nothing"* to per-element history and
  the five undeclared capabilities; narrow *"Non-Admin Roles Remain Inert
  After the Checklist Permissions Are Added"* so its `MANAGER = []` and
  no-`managerCapabilities` claims become `MANAGE_CHECKLIST_CONTENT`-specific.
- `user-management` — *"Update User"* accepts `managerCapabilities`; the
  meaningful-only-for-`MANAGER` invariant; the clear-on-role-change rule;
  `managerCapabilities` on the shared user response.
- `user-admin-ui` — *"Edit User"* gains the role-conditional capability
  toggle (grant **and** revoke); *"Create User"* explicitly unchanged;
  i18n coverage for the new keys.
- `review-session-management` — narrow its FR-008 deferral row (spec.md ~L473,
  L485) so only per-element history and the undeclared capabilities remain
  deferred.

## Approach

Extend the same three seams the prior slices built, plus one genuinely new
primitive.

Five proposal-level choices:

1. **The capability is the scope predicate, resolved in Layer 2 — not a
   permission.** `reviewSession:read` on `MANAGER` is unconditional and, on
   its own, grants nothing; `ReviewHistoryAccessService`'s new branch decides
   reachability. This is `MAINTENANCE_COMPANY_MANAGER`'s shipped pattern
   applied to a boolean-shaped scope instead of a company-id-shaped one, and
   it keeps `PermissionChecker.can(role, permission)` a pure static-table
   lookup with no user argument and no async DB read.
2. **Fresh per-request read, fail-closed, no JWT.** A revoked capability takes
   effect on the very next request. `Actor` stays `{userId, role}`; the
   checker reuses `USER_REPOSITORY.findById`, which already applies the
   `deletedAt: null` filter, so a soft-deleted manager resolves to "no
   capability" for free.
3. **Reuse `SYSTEM_ADMIN`'s read verbatim — do not add a second unscoped
   method.** A granted `MANAGER` gets literally everything, so a parallel
   method would be a duplicate with a different name and a second chance to
   drift. The consequence for the spec is real and must be stated, not
   implied: the shipped *"exactly one unscoped read, reachable only by
   `SYSTEM_ADMIN`"* requirement becomes *"exactly one unscoped read, reachable
   by `SYSTEM_ADMIN` unconditionally or by a `MANAGER` holding
   `VIEW_ALL_REVIEWS`"* — still one method, still two enumerable call sites.
4. **Clearing on role change is a resulting-state policy, not form
   behaviour.** The web form clearing the toggle on a role change is an
   affordance; the guarantee lives in `UpdateUserUseCase` evaluated against
   the resulting state, exactly like the maintenance-company policy. Any
   client, any payload shape, same outcome — a non-`MANAGER` user can never
   end a PATCH holding a capability.
5. **One declared enum member.** The enum's *shape* is ADR-011's; its
   *population* is this slice's. Each future capability adds its own member,
   its own branch and its own UI, the same way each FR-008 slice added its own
   `ROLE_PERMISSIONS` row without redesigning the table.

### PR chain sketch

One `stacked-to-main` chain (CLAUDE.md), branches
`review-history-manager-capability/<NN>-<slug>`, titles
`feat(review-history-manager-capability): PR N/M — ...`. My honest estimate is
**4 PRs, not 3**: the exploration's 3-PR sketch folds the schema/domain
plumbing and the checker plus the access-service branch into one PR, and it
underweights the write path (validation refinement + domain policy + use case
+ DTO + grant/revoke tests), which is comfortably a PR of its own. Chained PRs
are clearly needed; `sdd-tasks` owns the final split and the binding 400-line
forecast.

| PR | Content | Rough size |
|---|---|---|
| ~1 | `ManagerCapability` enum + `User.managerCapabilities` + migration + entity/mapper/repository/fake plumbing + migration & repository integration tests | ~250–350 |
| ~2 | Capability-scope checker (port + adapter + tests) + `ReviewHistoryAccessService` `MANAGER` branch + `ROLE_PERMISSIONS` row + ungranted-stays-inert regression tests | ~250–350 |
| ~3 | `PATCH /users/:id`: schema refinement, domain policy, use case, DTO, clear-on-role-change + unit/integration/E2E grant **and** revoke | ~350–450 |
| ~4 | Web capability toggle + route/entry-link widening + i18n + component tests + five-role E2E matrix + spec merges + FR-008 status + ADR-011 addendum + browser verification | ~350–450 |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` + `prisma/migrations/**` | Modified/New | `ManagerCapability` enum (one member) + `User.managerCapabilities`; additive, **no backfill** |
| `.../users/domain/user.entity.ts` | Modified | The user carries its capabilities; no constructor validation (shipped precedent) |
| `.../users/domain/` (new policy) | New | Capabilities-meaningful-only-for-`MANAGER` + clear-on-role-change, shaped after `maintenance-company-assignment.policy.ts` |
| `.../users/application/ports/user.repository.port.ts` + `infrastructure/persistence/**` + in-memory fake | Modified | Read/write the new field |
| `.../users/application/use-cases/update-user.use-case.ts` | Modified | Resulting-state capability rules |
| `.../users/presentation/dto/{update-user-request,user-response}.dto.ts`, `users.controller.ts` | Modified | Accept and return `managerCapabilities` |
| `packages/validation/src/users/update-user.schema.ts` (+ `create-user.schema.ts` helpers) | Modified | Optional field + NOT_ALLOWED refinement; `createUserSchema` **unchanged** |
| `shared/application/authorization/` (new checker port) | New | Capability-scope port, sibling of `company-scope.checker.port.ts` |
| `.../users/infrastructure/authorization/` (new adapter) | New | Fresh-read, fail-closed, exhaustive-`switch` adapter |
| `.../review-session/application/services/review-history-access.service.ts` | Modified | `MANAGER` branch in both switches, replacing `[]`/`null` |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modified | `MANAGER: ['reviewSession:read']` — first non-empty entry ever |
| `apps/web/src/pages/UserEditPage.tsx` (+ test) | Modified | Role-conditional capability toggle |
| `apps/web/src/App.tsx`, `auth/ProtectedRoute.test.tsx` | Modified | `/review-history*` `allowedRoles` 4 → 5 |
| `apps/web/src/pages/HealthPage.tsx` (+ test) | Modified | `MANAGER` added to `REVIEW_HISTORY_ROLES` |
| `apps/web/src/api/users.ts`, `i18n/locales/{en,es,ca}.json` | Modified | Field on the client type; real translations |
| `openspec/specs/{review-history,review-history-ui,authorization,user-management,user-admin-ui,review-session-management}/spec.md` | Modified | Delta specs |
| `docs/adr/ADR-011-*.md`, `docs/requirements/functional-requirements.md` | Modified | Addendum + FR-008 status |
| `apps/api/test/*.e2e-spec.ts` | New/Modified | Five-role matrix; MANAGER-without vs MANAGER-with; grant/revoke round trip |

**Untouched**: `ReviewSessionRepository` (no new method, no signature change),
`SessionAccessService`, the whole review-session write path,
`modules/community/**`, `modules/maintenance-company/**`, both existing scope
checkers, `UserCreatePage.tsx`, `POST /users`, and `createUserSchema`.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **A `MANAGER` without the capability gains access anyway** — a missing or inverted check turns the app's most inert role into its most privileged reader, on the largest data set in the system | High | Fail-closed early return **before** any repository call, mirroring `CompanyScopeChecker`'s shipped shape; the five-role E2E matrix asserts the ungranted manager gets `[]` and 404 on every route, no sampling; `sdd-verify` enumerates every call site of the across-installation methods |
| **The capability is read from the JWT** by this slice or a later one, making revocation silently lag by a token lifetime on a security grant | High | Settled decision + Approach choice 2 make the DB read binding; `Actor` gains no field; a test asserts a revoke takes effect on the next request with the **same** session/cookie, no re-login |
| **`MANAGER` gaining its first permission ever silently widens something else** — three specs and several tests encode "`MANAGER` is `[]`" as a global invariant, including `authorization`'s checklist-inertness requirement | High | Exactly one permission added; specs narrowed deliberately rather than deleted (named as in-scope spec work, with the checklist requirement called out explicitly); `sdd-verify` asserts `MANAGER` holds `reviewSession:read` and nothing else, and that no `/review-sessions*` write route or `checklistQuestion:*`/`reviewTemplate:*`/`user:*`/`community:*` permission reaches it |
| **A stale capability survives a role round trip** (`MANAGER` → other → `MANAGER`) and silently re-grants installation-wide read | Med | Settled decision 3 + Approach choice 4: enforced in the use case against the resulting state, not in the form; explicit unit + E2E round-trip test |
| **PATCH semantics swallow a revoke** — "field absent means unchanged" is the shipped partial-PATCH contract, so a form that omits the array on revoke would silently keep the grant | Med | Named as OQ3 with a working assumption; the form always submits the array while the role is `MANAGER`; an E2E test revokes and asserts the very next history request returns `[]` |
| **Scope creep into the other five ADR-011 capabilities** — the enum is right there, and declaring them is one line each | Med | Explicit non-goal; `sdd-verify` asserts the enum has exactly one member and that no other capability name appears anywhere in `apps/**` or `packages/**` |
| **An ungranted `MANAGER` gets a navigation link to an empty page**, because client route-gating is role-based and `/auth/me` carries no capability | Med | Named as OQ1 with a working assumption (role-only gate, empty state — server stays the only authority); browser-verified in **both** manager states so the wart is seen and judged, not assumed |
| **A Postgres enum-array column breaks the hand-written FK/partial-index conventions Prisma cannot see** (ADR-013) | Low | Extend the shipped `prisma-user.repository.integration.spec.ts` and migration-integration precedents rather than trusting Prisma's diff; the column is additive with an empty default and no FK |
| **The installation-wide list is unusable** — every session, all time, no filter, by standing decision | Med | Accepted and on record (inherited verbatim from the admin-scope slice); the app-wide filtering initiative is the remedy; the composite index shipped by that slice already covers this read |
| ES/CA translations stubbed with English placeholders | Low | Real translations in scope; `locales.test.ts` parity guard covers new keys |

## Rollback Plan

`git revert` the branch. There **is** one migration, but unlike
`review-history-company-scope` the asymmetry is benign:

- Code revert removes the access-service `MANAGER` branch (back to
  `[]`/`null`), the `ROLE_PERMISSIONS` entry, the capability checker, the
  `PATCH` field and refinement, and the web toggle plus the two role
  widenings — returning `MANAGER` to fully inert. No `ReviewSessionRepository`
  signature breaks; the other four roles' paths are untouched.
- The column can be left in place: it is non-authorizing, unread by any
  remaining code path, and its empty value is correct for every row. Dropping
  it discards the grants, but grants are **re-creatable in seconds through the
  UI** and there is no derived history to lose — there is no backfill and no
  lossy re-derivation, which is the defining difference from the company-scope
  rollback. **Recommended default: revert the code, keep the column.**
- Reverting the code **while leaving the column populated** is the safe
  intermediate state: a populated `managerCapabilities` grants nothing once
  the checker and the `ROLE_PERMISSIONS` entry are gone.
- Spec amendments, the ADR-011 addendum and the FR-008 status must be reverted
  with the code, or the specs will claim a grant the code no longer honours —
  and, worse, will have deleted the guards that keep `MANAGER` inert.
- Each PR in the sketched chain reverts independently.

## Dependencies

- **`review-history-admin-scope` (archived 2026-09-14)** — supplies
  `findCompletedAcrossInstallation` / `findCompletedByIdAcrossInstallation`
  (reused verbatim), the composite
  `ReviewSession(status, completedAt, id)` index that keeps the unscoped read
  off a full table scan, and the four-role E2E matrix this slice widens to
  five.
- **`review-history-company-scope` (archived 2026-09-13)** — the per-branch
  Layer 2 scope-resolution shape, `CompanyScopeChecker` /
  `UserCompanyScopeChecker` as the template for the new checker, and the
  `HealthPage` entry-link precedent.
- **`review-history` (archived 2026-09-09)** — routes,
  `ReviewHistoryAccessService`, both pages, the read-only detail view.
- **`user-management` + `user-admin-ui`** — `PATCH /users/:id`,
  `UpdateUserUseCase`, `updateUserSchema`, `UserEditPage.tsx`'s
  role-conditional-field pattern, and `user:update`'s existing
  `SYSTEM_ADMIN`-only gate.
- **ADR-011 Decision 2** — the accepted signature this slice implements.
- **No new runtime dependency.** Reuses `AuthenticatedGuard` +
  `PermissionsGuard` + `@RequirePermission`, `buildCodedError`,
  `apiFetch`/`ApiError`, `ProtectedRoute allowedRoles`.
- **For browser verification**, a running dev server plus seeded data.
  `prisma/seed.ts` creates **only** a `SYSTEM_ADMIN` (verified), so this slice
  needs, created through the UI or a fixture: **two `MANAGER` users** — one to
  be granted, one left ungranted as the live inertness check — plus completed
  sessions spanning **at least two maintenance companies** and **two
  communities**, and at least one session whose community or company has been
  deactivated/soft-deleted (to confirm `VIEW_ALL_REVIEWS` really means
  everything).

## Success Criteria

**Granting and revoking**

- [ ] A `SYSTEM_ADMIN` can grant `VIEW_ALL_REVIEWS` to a `MANAGER` from that
      user's edit page, and the grant persists across a reload.
- [ ] The same control **revokes** it, and the revoked manager's very next
      history request returns nothing — **with no logout and no re-login**.
- [ ] The toggle appears **only** when the edited user's role is `MANAGER`,
      and disappears immediately on a role change away from it.
- [ ] `POST /users` and the create form are unchanged: a newly created
      `MANAGER` holds no capability and there is no way to grant one at
      creation.
- [ ] A `PATCH` that sets a capability for a non-`MANAGER` resulting role is
      rejected with a cause-specific, i18n-mapped message.

**Reading all history (granted)**

- [ ] A granted `MANAGER` sees **every** completed session in the
      installation, in the same deterministic order the other scopes use, on
      the same `/review-history` surface — no manager variant.
- [ ] They can open any of those sessions and read back the full recorded
      record, identically to the performer and the admin.
- [ ] Sessions of a **deactivated/soft-deleted community or maintenance
      company are visible** to them, exactly as to a `SYSTEM_ADMIN`.
- [ ] An empty installation renders an empty state, not an error.
- [ ] Drafts never appear; a nonexistent or draft `sessionId` still returns
      `404 REVIEW_SESSION_NOT_FOUND`.

**Inertness (ungranted) — the regression that matters most**

- [ ] An **ungranted** `MANAGER` receives `[]` from `GET /review-history` and
      `404 REVIEW_SESSION_NOT_FOUND` from every by-id request, on every route
      — observably identical to today.
- [ ] An ungranted `MANAGER` reaches no repository call at all.
- [ ] A **soft-deleted** `MANAGER` holding the capability resolves to no
      capability and sees nothing.
- [ ] A `MANAGER` whose role was changed away and later changed back holds
      **no** capability.

**Role change hygiene**

- [ ] Changing a `MANAGER`'s role to any other role clears
      `managerCapabilities`, enforced server-side regardless of payload shape
      or client.

**Visibility of the other four roles**

- [ ] All four shipped scopes are **unchanged**: technician own-only
      (surviving assignment deactivation), representative active-communities
      only, company manager own-company only and fail-closed on a null
      company, system admin everything.
- [ ] `MANAGER` holds `reviewSession:read` and **no other** permission of any
      family — no `reviewSession:create/perform/complete/discard`, no
      `user:*`, `community:*`, `maintenanceCompany:*`, `checklistQuestion:*`,
      `reviewTemplate:*` or `inspectableElement:*`.
- [ ] No write route (`/review-sessions*`) is widened to `MANAGER`.

**Scope guards**

- [ ] The `ManagerCapability` enum declares **exactly one** member; none of
      ADR-011's other five capability names appears anywhere in `apps/**` or
      `packages/**`.
- [ ] `managerCapabilities` appears in **no** JWT claim, token payload, or
      client-side authorization decision.
- [ ] The capability is re-read from the database on **every** request; there
      is no cache.
- [ ] Still exactly **one** unscoped "all sessions" repository read, with no
      new method and no `ReviewSessionRepository` signature change; its call
      sites are exactly the `SYSTEM_ADMIN` and `MANAGER` branches of
      `ReviewHistoryAccessService`.
- [ ] No audit-log table, event or write ships.
- [ ] No per-element history query, route or view exists.
- [ ] No pagination, date filter, sort or search control ships on any history
      read or page.
- [ ] No new permission (e.g. `user:grantCapability`) and no second grantor
      role exist.
- [ ] No demo-mode-specific branch was added.

**Documentation & quality**

- [ ] The ADR-011 addendum records Decision 2's first implementation, the
      one-declared-member scoping, and the not-in-the-JWT resolution.
- [ ] FR-008's status records the role-based visibility axis as complete and
      names per-element history as what remains.
- [ ] Zero hardcoded UI strings; every new key has real `en`/`es`/`ca`
      translations, parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] The migration applies cleanly against real Postgres, and its
      pre-migration state is verified via a simulated drop inside a
      transaction, per the `review-session` migration-spec precedent (this
      repo has no `down.sql` convention), with the hand-written FKs and
      partial indexes intact.
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server
      — including the grant, the revoke, and an **ungranted** manager's login
      — not only test-verified (CLAUDE.md).

## Open questions for `sdd-spec` / `sdd-design`

Each has a working assumption; none blocks the next phases. (Former OQ1 —
what an ungranted `MANAGER` sees in the web app — is now a settled scope
decision above, confirmed with the product owner; not repeated here.)

1. **How the edit form prefills the toggle.** There is no `GET /users/:id`
   (`user-admin-ui` design Decision 5); the page selects its row from
   `listUsers()`. *Working assumption*: `managerCapabilities` joins
   `maintenanceCompanyId` on the shared `UserResponseDto`, so list, create and
   update responses all carry it.
2. **Absent field vs. empty array on `PATCH`.** *Working assumption*: absent
   ⇒ unchanged (the shipped partial-PATCH contract); `[]` ⇒ explicit revoke;
   the web form always submits the array while the role is `MANAGER`, the
   same way it always submits `maintenanceCompanyId` while the role is
   maintenance-side. `sdd-design` must state this explicitly — the silent
   failure mode is a revoke that does nothing.
3. **Where the checker and its port live, and what they return.** *Working
   assumption*: a `shared/application/authorization/` port (sibling of
   `company-scope.checker.port.ts`) with a `users/infrastructure/authorization/`
   adapter (sibling of `UserCompanyScopeChecker`). Whether it answers a
   capability **list** or a single `has(capability)` boolean is
   `sdd-design`'s: the list is more faithful to ADR-011's shape, the boolean
   is harder to misuse.
4. **Whether the clear-on-role-change rule is a domain policy or use-case
   logic.** *Working assumption*: a policy module mirroring
   `maintenance-company-assignment.policy.ts`, so both directions (cleared on
   demotion, rejected on a non-`MANAGER` resulting role) live in one testable
   place.
5. **Migration default for an enum-array column.** *Working assumption*: an
   empty-array default, making the column additive with no backfill — but
   `sdd-design` should state it rather than letting Prisma's generated SQL
   decide, given `schema.prisma`'s standing "no silent `@default`" note on
   `Role`.

## Deferred by this slice (ADR-006 record)

Not designed here, deliberately:

- **ADR-011 Decision 2's other five capabilities** — each gets its own slice
  with its own enum member, permission rows and UI.
- **Audit trail** for capability and role changes — still ADR-011 Decision 5's
  named future FR.
- **Per-element history** — FR-008's other axis, its own future exploration,
  which must first settle whether it reverses `review-history-ui`'s
  no-filtering rule.
- **App-wide filtering/sorting/pagination/search** — the cross-cutting
  initiative named since `review-history-company-scope`.

**FR-008's role-based visibility axis closes with this slice. FR-008 itself
closes only after per-element history lands.**

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel; no blocking
product input is outstanding. `sdd-design` owns OQ1 (the ungranted manager's
client-side experience) and OQ3 (revoke semantics) above all: those are the
two whose wrong answer is a silent failure rather than a visible one.
