# Proposal: Inspectable Elements per Community

## Intent

FR-004 — "Manage inspectable elements per community" — is the **subject of the
entire product**. Every downstream requirement points at it: FR-006 prints its
label, FR-007 scans it to open a review, FR-008 shows its history, FR-009 chases
its overdue checks. And the codebase does not know it exists — a grep for
`InspectableElement` / `inspectable` across `apps/api/src` and `apps/web/src`
returns zero matches, and `ElementType` (ADR-008's closed catalog) has no code
representation either, in any layer.

Today the app can describe *who* (users, roles, maintenance companies) and
*where* (communities), but not *what gets inspected*. A community in this system
is currently an empty shell: a name, an address, a locale, a representative, and
some technicians — with nothing to inspect. This slice puts the first
extinguisher inside it.

Success looks like: a `SYSTEM_ADMIN` opens "Residencial Los Olivos", registers
an extinguisher on the ground-floor corridor with its installation date, edits
its location after it is moved, and soft-deletes it when it is removed from the
building — end to end, Prisma → domain → use cases → REST → web UI.

Per ADR-006's 2026-08-25 addendum, the minimal web UI ships **in this change**.
This is the second slice under that rule with no retrofit backlog behind it.

Context: `[[sdd/inspectable-elements/explore]]`,
`openspec/changes/archive/2026-08-31-maintenance-company/`,
`openspec/changes/archive/2026-08-25-community/`, ADR-006, ADR-008, ADR-009,
ADR-010, ADR-011, ADR-013, ADR-015,
`docs/architecture/domain-model-inspections.md` §InspectableElement,
`docs/requirements/functional-requirements.md` FR-004/FR-006.

## Settled product decisions

Closed with the product owner before this proposal. Inputs, not open items.

| Decision | Resolution |
|---|---|
| **Entity shape** | `InspectableElement` = `id` (UUIDv7, ADR-009), `communityId` (FK), `elementType`, `name`, `description?`, `location`, `serialNumber?`, `installedAt`, `deletedAt` (ADR-010). Every other field in the domain doc's list is deferred below. No `createdAt`/`updatedAt` — matching `Community` and `MaintenanceCompany`, not `User`. |
| **`MANAGER` + `MANAGE_INSPECTABLE_ELEMENTS`** | **Not activated.** `SYSTEM_ADMIN` only, mirroring `maintenance-company`'s identical deferral (its Open Q8). `User.managerCapabilities` still does not exist as a field; building capability-based permission resolution is its own slice. FR-004 stays deliberately half-satisfied. |
| **`COMMUNITY_REPRESENTATIVE` own-community access** | **Not activated.** The role stays fully inert for this domain. Resource-scoped authorization is a real, undesigned mechanism — `PermissionChecker.can(role, permission)` has no resource parameter at all — so it is deferred **entirely**, not stubbed. No half-built scope argument, no dead code path. |
| **`code` (the QR/label identifier)** | **Not generated here.** Entirely FR-006's concern. No `code` column, no alphabet constant, no QR anything. The domain doc's 10-character generation rules stay unimplemented. |
| **`serialNumber`** | Stored, optional, **informational only** — exactly as the domain doc says. Not a lookup key, not unique, not validated beyond trimmed-non-empty-if-present. |
| **Typed per-element details** | **Not in v1.** `elementType` is stored (ADR-008's fixed enum) but no type-specific detail sub-shape ships — no `ExtinguisherDetails`, no `weightKg`/`agentType`/`efficacyRating`. Type-agnostic base fields only. The domain doc itself calls those shapes "illustrative, refined when each type is actually implemented". |
| **`ElementType` values in v1** | `EXTINGUISHER` only. ADR-008's catalog is reused as the *governing decision* (closed, code-level, dev-extended) — it has no code representation yet, so this slice creates it, seeded with the single value the doc names as existing today. Adding `BIE`, `FIRE_DOOR`, … is a later deploy, per ADR-008's own consequences. |
| **Hydrostatic test tracking** | **Not in this slice.** No `lastHydrostaticTestAt`, no `hydrostaticTestCount`, no 5-year/3-test constants. Deferred entirely — it is a compliance clock, not a CRUD field, and nothing reads it yet. |
| **`active` (decommission) vs. soft-delete** | **One lifecycle action only: soft-delete** (`deletedAt`, ADR-010), mirroring `Community` and `MaintenanceCompany`. No separate `active`/decommission field, no decommission action, no two-off-states UX. The domain doc's `active` ("keeps history but stops appearing in new reviews") only earns its distinction once reviews exist (FR-007) — until then it is indistinguishable from a delete, and shipping both would be two ways to do the same thing. |
| **Uniqueness on `name` / `location`** | **None.** Free text, unconstrained — like `MaintenanceCompany.contactInfo`. Two extinguishers in the same corridor legitimately share a name and a location; the future `code` (FR-006) is the identifier, not the name. |
| **`imageUrl`** | **Deferred — confirmed with the product owner.** The domain doc lists it, but there is **no file-upload or asset-storage capability anywhere in the codebase** (verified: zero matches for `upload`/`multipart`/`FormData`/`imageUrl` under `apps/*/src`). Shipping it means choosing a storage backend, a multipart pipeline, authenticated asset reads, and orphan cleanup on soft-delete — an infrastructural slice in its own right, larger than this entity's whole CRUD. Adding the column later is trivial. |
| **Community soft-delete vs. its elements** | **Blocked, not cascaded — confirmed with the product owner.** Soft-deleting a community with any active (non-soft-deleted) `InspectableElement` attached is rejected with a new domain error, HTTP-mapped to a coded 409, mirroring `MaintenanceCompanyHasActiveUsersError` → `MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`. **Explicitly not the final shape**: the product owner's stated direction is that community deletion should eventually cascade-soft-delete its elements; this slice ships the simpler block-only guard to stay thin, with the cascade as a named future revisit (Open Question 1). **Implementation confirmed atomic, not check-then-act** (`sdd-design` Decision 6): `maintenance-company`'s PR7 shipped a count-then-write guard that had a real race (a concurrent create between the count and the write orphaned an active user under a soft-deleted company) and needed a PR8 follow-up fix to become atomic. This slice mirrors the *final, corrected* shape from day one — `CommunityRepository.softDeleteById` becomes `Promise<boolean>` via a single `UPDATE ... WHERE ... AND NOT EXISTS (active element)` statement — rather than repeating a known bug on purpose. This widens the "one guard" footprint inside `community` to four mechanical edits (see Scope and Affected Areas below), all confirmed. |
| **Web UI** | In scope, minimal: a community-scoped elements list page plus create and edit pages, mirroring `MaintenanceCompan*Page`. `CommunityDetailPage` gains one entry-point link. |

## Scope

### In Scope

- **Prisma**: `InspectableElement` model (`id` `@db.Uuid`, `communityId`
  `@db.Uuid`, `elementType`, `name`, `description?`, `location`,
  `serialNumber?`, `installedAt`, `deletedAt?`) and an `ElementType` Postgres
  enum with the single value `EXTINGUISHER` — mirroring the `Role` / `Locale`
  precedent. Hand-written FK to `Community(id)` with `ON DELETE RESTRICT` in
  `migration.sql`, plus an index on `communityId` (every list query filters on
  it), following the `20260825120000_add_community_and_assignments` and
  `User.maintenanceCompanyId` precedents — Prisma models here carry no
  `@relation` (ADR-013).
- **Domain**: hand-written `InspectableElement` entity, zero Prisma dependency
  (ADR-013); `ElementType` as a TypeScript union in the domain layer (ADR-008),
  the code-level source of truth the Postgres enum mirrors.
- **Application**: `InspectableElementRepositoryPort` + four use cases (create /
  list-by-community / update / soft-delete), each guarded by a **parent
  community existence check** reusing the already-shipped `COMMUNITY_REPOSITORY`
  port's `findById` (which already applies the `deletedAt: null` default filter).
- **`community` module — four mechanical edits, confirmed in scope**: a new,
  narrow `InspectableElementCounter` port (`countActiveByCommunity`) owned BY
  `community` (not on `InspectableElementRepositoryPort` — this avoids
  `CommunityModule` needing to import `InspectableElementModule`, keeping the
  dependency direction `inspectable-element` → `community` only, per
  `sdd-design` Decision 4); `CommunityRepository.softDeleteById` changes from
  `Promise<void>` to `Promise<boolean>`, becoming a single atomic
  `UPDATE ... WHERE ... AND NOT EXISTS (active element)` statement — mirroring
  the *final, corrected* `MaintenanceCompanyRepository.softDeleteById` shape,
  not its superseded check-then-act predecessor (confirmed choice, see Settled
  decisions); the Prisma adapter and the in-memory fake both reflect the new
  boolean contract; a new `CommunityHasActiveElementsError` HTTP-maps to a
  coded 409 (`COMMUNITY_HAS_ACTIVE_ELEMENTS`). This is the one deliberate,
  confirmed exception to "the `community` module is not modified" below.
- **Presentation**: REST endpoints nested under the community, Zod validation via
  `shared/presentation/pipes/zod-validation.pipe.ts`, Swagger annotations, and
  domain-error → HTTP mapping.
- **Error codes**: machine-readable `code` from day one
  (`COMMUNITY_NOT_FOUND`, `INSPECTABLE_ELEMENT_NOT_FOUND`), built with the
  shared `buildCodedError` envelope helper
  (`shared/presentation/http/coded-error.ts`) that `maintenance-company`'s
  design extracted — this slice is its fourth consumer and must **use** it, not
  mirror a fourth hand-rolled copy.
- **Authorization**: extend the `Permission` union in
  `shared/application/authorization/permission.ts` with
  `inspectableElement:create|read|update|delete`, granted to `SYSTEM_ADMIN`
  only. The four non-admin rows in `role-permission.checker.ts` stay `[]`.
- **Shared validation**: `packages/validation/src/inspectable-element/*.schema.ts`
  (ADR-015), including the `elementType` enum shared web/API.
- **Web UI**: `CommunityElementsListPage`, `InspectableElementCreatePage`,
  `InspectableElementEditPage` under `ProtectedRoute
  allowedRoles={['SYSTEM_ADMIN']}`, reusing `apiFetch`, `ApiError`,
  `ConfirmDialog`, `NotAuthorized` and the `ApiError → i18n key` contract
  verbatim from `maintenance-company`. `CommunityDetailPage` gains a link to
  the community's elements — its only change.
- **i18n**: real `inspectableElement.*` translations in `en`, `es` and `ca`,
  key-set parity enforced by the existing `locales.test.ts`. `elementType`
  values are rendered through a label map, never as raw `EXTINGUISHER`.
- Unit, integration and E2E tests matching the `maintenance-company` /
  `community` conventions, plus browser verification of every UI criterion per
  CLAUDE.md's "Verifying UI Changes" rule.

### Out of Scope

- **`code` generation, QR rendering, label printing** — all of FR-006.
- **Any review-side entity** — `ChecklistQuestion`, `ReviewTemplate`,
  `ReviewSession`, `ElementReviewEntry` (FR-005/005b/007). They will FK to
  `InspectableElement.id`, which this slice makes exist; nothing more.
- **Typed element details** and **any second `ElementType` value**.
- **Hydrostatic test tracking** and the RD 809/2021 constants.
- **The `active`/decommission lifecycle** — one "off" state ships.
- **`MANAGE_INSPECTABLE_ELEMENTS` for `MANAGER`** — needs
  `User.managerCapabilities`, which does not exist. Its own slice.
- **`COMMUNITY_REPRESENTATIVE` own-community scoping** — needs a
  resource-scoped `PermissionChecker`, the first of its kind. Its own slice,
  and a genuinely significant one.
- **Image upload / asset storage** (see Settled decisions, Open Question 2).
- **A flat cross-community elements list** (`GET /inspectable-elements`),
  search, filtering by type, pagination, bulk import, restore of soft-deleted
  elements, audit logging.
- **Cascade soft-delete of a community's elements.** Confirmed as the
  eventual direction, not this slice's job — see the "Community soft-delete
  vs. its elements" settled decision above.
- **Any other change to `community`'s own use cases** — beyond the one
  confirmed `SoftDeleteCommunityUseCase` guard above. No change to
  `maintenance-company`, `users`, or `auth` beyond the one permission row.
- **A global nav bar** — pre-existing, separately tracked gap, carried forward
  from `community-minimal-ui` Open Q8 and `maintenance-company` Open Q9. This
  slice's elements list is reachable from `CommunityDetailPage`, so it is *not*
  a fourth URL-only section; the nav gap itself is still not closed here.

### Why this scope and not more (ADR-006)

The temptation is enormous: `InspectableElement` is where the product's value
actually lives, so it pulls `code` + QR (FR-006) and the review workflow
(FR-007) in behind it. The walking-skeleton rule says register the element
first. A registry of extinguishers with no reviews is **independently useful
today** — it is the building's fire-safety asset inventory, which right now
lives in a spreadsheet or nowhere. Every deferred item above is additive to
this shape, not a rework of it.

The second temptation is the authorization work. FR-004's wording names two
non-admin access paths, and the exploration correctly identified that this is
the first FR that *needs* real scoped authorization. Building it here would
mean designing capability-based permissions **and** the first resource-scoped
permission check **and** a new entity **and** its UI in one change. Both
`community` and `maintenance-company` set the precedent: ship the entity
`SYSTEM_ADMIN`-only, activate roles in a dedicated slice. Nothing regresses —
those roles have `[]` permissions today and will still have `[]` after.

## Capabilities

### New Capabilities

- `inspectable-element-management`: admin CRUD over a community's inspectable
  elements — create, list-by-community, update, soft-delete — with the
  parent-community existence guard and `SYSTEM_ADMIN`-only access.
- `inspectable-element-admin-ui`: the `SYSTEM_ADMIN`-gated web surface —
  community-scoped route gating, list, create/edit forms, confirmed
  soft-delete, element-type label rendering, and the `ApiError → localized
  message` contract for the new error codes.

### Modified Capabilities

- `authorization`: the `Permission` union and the `SYSTEM_ADMIN` row of
  `ROLE_PERMISSIONS` gain `inspectableElement:*`. Additive and non-breaking;
  the four inert roles remain `[]`.
- `community-admin-ui`: `CommunityDetailPage` gains a navigation entry point to
  the community's inspectable elements. No other community requirement changes.

## Approach

Mirror `apps/api/src/modules/maintenance-company/**` file by file — the most
recently reviewed and archived flat-aggregate CRUD module — **not**
`CommunityRepresentative`'s join/lifecycle pattern. Per the exploration:
`InspectableElement` has no assignment state machine, no exclusivity invariant,
no reactivation; it is flat CRUD that happens to carry a required parent id.

| `apps/api/src/modules/maintenance-company/**` | → mirrored under `apps/api/src/modules/inspectable-element/**` |
|---|---|
| `domain/maintenance-company.entity.ts` (no Prisma, ADR-013) | `domain/inspectable-element.entity.ts` + `domain/element-type.ts` |
| `domain/errors/*.error.ts` | `InspectableElementNotFoundError` (+ reuse `CommunityNotFoundError`) |
| `application/ports/*.repository.port.ts` (`Symbol` token) | `InspectableElementRepositoryPort` |
| `application/use-cases/*.use-case.ts` | create / list-by-community / update / soft-delete |
| `application/use-cases/testing/in-memory-*.repository.ts` | in-memory fake with invariant parity |
| `infrastructure/persistence/prisma-*.repository.ts` (extends `soft-deletable.repository.ts`) | same default `deletedAt: null` filter (ADR-010) |
| `infrastructure/persistence/*.mapper.ts` | persistence ↔ domain mapper |
| `presentation/*.controller.ts` + `dto/**` + `*-error-code.ts` | controller, DTOs, `InspectableElementErrorCode` |
| `maintenance-company.module.ts` | `inspectable-element.module.ts` (imports `CommunityModule` for the port) |

Web side: `apps/web/src/inspectable-element/` mirrors
`apps/web/src/maintenance-company/` (`error-messages.ts`, `element-type-labels.ts`),
and the three pages clone their `MaintenanceCompan*Page` siblings including the
documented static-before-dynamic route-ordering comments in `App.tsx`.

Four deliberate proposal-level choices:

1. **Routes are nested under the community, not flat with a query filter.**
   `@Controller('communities/:communityId/inspectable-elements')`, giving
   `POST` / `GET` on the collection and `PATCH` / `DELETE` on
   `:elementId`. The precedent is unambiguous: **every** community-scoped
   resource in `community.controller.ts` is already nested
   (`GET :id/representatives`, `POST :id/technicians`,
   `DELETE :id/representatives/:userId`), and there is **no
   `?parentId=` query-filter precedent anywhere in this codebase**. FR-004 is
   literally worded "per community". Nesting also puts the community id in the
   path, which is exactly where the deferred `COMMUNITY_REPRESENTATIVE`
   scoping check will need it. The URL segment is `inspectable-elements`
   (matching the entity and permission names, as `/maintenance-companies`
   matches `MaintenanceCompany`) — see Open Question 3 on FR-006's future
   `/elements/{code}` deep link, which is a separate, globally-unique lookup
   and does not conflict.
2. **The module lives on its own, and reads the community through its port.**
   A new `inspectable-element` module, not extra routes bolted onto
   `CommunityController` — which is already ~400 lines with 13 routes. The
   parent-existence guard consumes the exported `COMMUNITY_REPOSITORY` token,
   the same direction of dependency `users` → `maintenance-company` already
   established. The `community` module itself is not modified.
3. **Element editing reuses the list, with no `GET /:id`.** There is no
   `GET /communities/:id` in this codebase; `useCommunity` fetches the list and
   selects client-side, with an explicit `not-found` state (documented in
   `use-community.ts`). The element edit page follows that exact precedent
   rather than inventing a single-resource endpoint this slice does not
   otherwise need.
4. **`ElementType` is a domain union first, a Postgres enum second.** ADR-008
   makes the TypeScript union authoritative; the Postgres enum is its
   persistence projection, exactly as `Role` and `Locale` already are. The
   mapper is the only place the two meet, and an exhaustiveness check must make
   adding a value a compile error, not a runtime surprise.

### Deferred to `sdd-spec` / `sdd-design` (do not resolve here)

- Whether `installedAt` is a `DateTime` or a date-only column, and whether a
  future installation date is rejected or allowed.
- Whether `name` / `location` / `serialNumber` become Value Objects (ADR-006
  addendum: decided per slice; `maintenance-company` decided *no* for all of
  its fields and that reasoning likely carries).
- Whether the elements list page is a distinct route or a section embedded in
  `CommunityDetailPage`. Proposed: **distinct route** — elements are the
  highest-cardinality entity in the system (dozens to hundreds per community),
  and `CommunityDetailPage` already renders two assignment sections; a distinct
  route keeps that page a one-line change and clones the
  `MaintenanceCompaniesListPage` template verbatim.
- Whether a soft-deleted element's `serialNumber` or identity needs to survive
  for future FR-007 history (no reviews exist yet, so nothing references it).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma`, `migrations/` | Modified | `ElementType` enum + `InspectableElement` model + hand-written FK + `communityId` index |
| `apps/api/src/modules/inspectable-element/domain/**` | New | Entity, `ElementType` union, errors |
| `apps/api/src/modules/inspectable-element/application/**` | New | Port, 4 use cases, in-memory fake |
| `apps/api/src/modules/inspectable-element/infrastructure/persistence/**` | New | Prisma adapter (extends `soft-deletable.repository.ts`), mapper |
| `apps/api/src/modules/inspectable-element/presentation/**` | New | Controller, DTOs, `inspectable-element-error-code.ts` |
| `apps/api/src/modules/inspectable-element/inspectable-element.module.ts` | New | Providers + controller wiring, imports `CommunityModule` |
| `apps/api/src/modules/community/domain/community-deletion.policy.ts` | New | `assertNoActiveElementsAttached` — pure domain policy, mirrors `MaintenanceCompany`'s deletion policy |
| `apps/api/src/modules/community/domain/errors/community-has-active-elements.error.ts` | New | Carries `activeElementCount`; mirrors `MaintenanceCompanyHasActiveUsersError` |
| `apps/api/src/modules/community/application/ports/inspectable-element-counter.port.ts` | New | Narrow `countActiveByCommunity` port + `INSPECTABLE_ELEMENT_COUNTER` token, owned by `community` (keeps the DI direction one-way) |
| `apps/api/src/modules/community/infrastructure/persistence/prisma-inspectable-element-counter.repository.ts` | New | ~12-line count probe adapter for the counter port |
| `apps/api/src/modules/community/application/ports/community.repository.port.ts` | Modified | `softDeleteById(): Promise<boolean>` + doc comment on the atomic guarantee |
| `apps/api/src/modules/community/infrastructure/persistence/prisma-community.repository.ts` | Modified | `softDeleteById` becomes the atomic `UPDATE ... NOT EXISTS` |
| `apps/api/src/modules/community/application/use-cases/testing/in-memory-community.repository.ts` | Modified | Fake reproduces the boolean contract |
| `apps/api/src/modules/community/application/use-cases/soft-delete-community.use-case.ts` | Modified | Calls `softDeleteById`, re-checks via the counter port on `false` to report `CommunityHasActiveElementsError` precisely — mirrors `SoftDeleteMaintenanceCompanyUseCase`'s final shape |
| `apps/api/src/modules/community/presentation/community.controller.ts` | Modified | One new error-mapping branch + `@ApiConflictResponse` on `DELETE` |
| `apps/api/src/modules/community/presentation/community-error-code.ts` | Modified | `+ COMMUNITY_HAS_ACTIVE_ELEMENTS` |
| `apps/api/src/modules/community/community.module.ts` | Modified | Binds `INSPECTABLE_ELEMENT_COUNTER`; imports nothing new |
| `apps/api/src/app.module.ts` | Modified | Register the new module |
| `apps/api/src/shared/presentation/http/coded-error.ts` | Modified (reported finding) | Widen `CodedErrorStatus` with `NOT_FOUND` — two additive lines, see Settled decisions |
| `apps/api/src/shared/application/authorization/permission.ts` | Modified | Extend `Permission` union |
| `apps/api/src/modules/auth/infrastructure/authorization/role-permission.checker.ts` | Modified | Grant `inspectableElement:*` to `SYSTEM_ADMIN` only |
| `packages/validation/src/inspectable-element/**` | New | Zod schemas shared web/API |
| `apps/web/src/api/inspectable-element.ts` | New | Typed calls + mirrored error-code union |
| `apps/web/src/inspectable-element/**` | New | `error-messages.ts`, element-type label map |
| `apps/web/src/pages/CommunityElementsListPage.tsx`, `InspectableElement{Create,Edit}Page.tsx` | New | List, create, edit |
| `apps/web/src/pages/CommunityDetailPage.tsx` | Modified | One entry-point link to the community's elements |
| `apps/web/src/App.tsx` | Modified | 3 role-gated nested routes, static-before-dynamic |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Real `inspectableElement.*` translations |
| `apps/api/test/**` | New | `inspectable-element.e2e-spec.ts` |

Untouched by design, except the confirmed guard above: `apps/api/src/modules/community/**`
is otherwise consumed via its exported port only — the four edits listed in
Affected Areas (the new counter port, `softDeleteById`'s atomic rewrite, its
Prisma adapter and in-memory fake, plus the one new domain error) are the
full, confirmed extent of the touch; nothing else in `community` changes.
`modules/users/**`, `modules/maintenance-company/**`, `modules/auth/**` beyond
the one permission row untouched. `shared/presentation/http/coded-error.ts`
needs a small, confirmed widening: `CodedErrorStatus` is currently a closed
`BAD_REQUEST | CONFLICT` union, and this slice's two 404s
(`COMMUNITY_NOT_FOUND`, `INSPECTABLE_ELEMENT_NOT_FOUND`) need a `NOT_FOUND`
member added — two additive lines, zero behavior change for existing callers,
already covered by `coded-error.spec.ts`. Reported per the `maintenance-company`
precedent as a finding, not silently widened.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Scope creep toward `code` + QR (FR-006).** "The element exists now, let's give it a label" | High | Explicit non-goal. `sdd-verify` asserts no `code` column, no QR dependency, no `/elements/:code` route exists |
| **Scope creep toward typed details.** `ExtinguisherDetails` is fully sketched in the domain doc and looks free | High | Explicit non-goal with a stated reason (the doc calls those shapes illustrative). `sdd-verify` asserts the entity has base fields only |
| **Scope creep toward real scoped authorization.** FR-004's wording invites it | High | Explicit non-goal; the exploration sized it as the first resource-scoped `PermissionChecker` in the codebase. `sdd-verify` asserts `ROLE_PERMISSIONS` still maps all four non-admin roles to `[]` and that `PermissionChecker.can`'s signature is unchanged |
| **Community-delete guard forgets an edge case** (e.g. counts soft-deleted elements) | Low | Confirmed atomic (`UPDATE ... NOT EXISTS`, `sdd-design` Decision 6) mirroring `maintenance-company`'s *final, corrected* shape, not its superseded PR7 check-then-act — the concurrent-create race that pattern had is closed by construction, not merely documented as accepted. `sdd-spec`/`sdd-tasks` write it as an explicit scenario with unit + integration + e2e tests |
| **Prisma regenerating the migration drops the hand-written FK/index** — the exact hazard `schema.prisma`'s existing WARNING block documents for `MaintenanceCompany` | Med | Same mitigation as the shipped one: hand-written `migration.sql` plus an integration test asserting the constraint's continued presence via `pg_constraint`/`pg_indexes` |
| **`ElementType` rendered raw in the UI** — `users-minimal-ui` shipped raw `Role` text and had to patch it | Med | A label map with i18n keys, called out in the success criteria and grep-checked by `sdd-verify` |
| **Nested-route ordering bugs in React Router** — `/communities/:id/inspectable-elements/new` vs `/:elementId/edit` | Med | The `App.tsx` static-before-dynamic comments already document the rule for `/communities/new` and `/maintenance-companies/new`; the same comment convention applies, with route-resolution tests |
| **`elementType` enum drift between Postgres, the domain union, and the Zod schema** — three declarations of one truth | Med | Proposal-level choice 4: domain union is authoritative, exhaustiveness-checked mapper, and the Zod schema in `@sf-manager/validation` derives from the shared list; a test asserts all three agree |
| **Reviewer overload** — new API module + migration + 3 new pages + validation package + i18n in one PR | High | `sdd-tasks` must forecast against the 400-line budget; chained PRs (`stacked-to-main`, as in all prior chains) are the expected outcome |
| ES/CA translations stubbed with English placeholders | Med | Real translations in scope; `locales.test.ts` parity guard extends to `inspectableElement.*` |
| **`imageUrl` deferral turns out wrong** and users cannot identify elements without a photo | Low | Confirmed with the product owner (Settled decisions). Adding a nullable column later is a trivial, additive migration; building storage prematurely is not |

## Rollback Plan

Revert the branch and roll back the single migration (`prisma migrate reset` in
dev), dropping the `InspectableElement` table, the `ElementType` enum, the FK
and the index. Most of the change is purely additive and self-contained: a new
API module under `apps/api/src/modules/inspectable-element/**`, a new
validation sub-package, three new web pages, a new
`apps/web/src/inspectable-element/**` folder, new locale keys, one `Permission`
union extension and new entries on the `SYSTEM_ADMIN` row.

Several edits touch existing files: `app.module.ts` (one import + one array
entry), `App.tsx` (three routes), `CommunityDetailPage.tsx` (one link) are
purely mechanical. The `community` module's cluster of edits (the atomic
`softDeleteById` rewrite, its Prisma adapter and in-memory fake, the new
counter port + adapter, the deletion policy, the new domain error, and the
controller/error-code/module wiring) is a genuine behavior change together:
reverting all of it restores today's unconditional community soft-delete.
`coded-error.ts`'s `NOT_FOUND` widening is additive and safe to leave even if
the rest is reverted. Reverting the whole slice restores current behavior
verbatim; any elements registered during the slice's life are lost with the
table, and nothing else references them.

If the chain is split across PRs, each reverts independently, with the migration
PR as the only one carrying schema state.

## Dependencies

- None new. Reuses `IdGenerator` (UUIDv7, ADR-009), `SoftDeletableRepository`
  (ADR-010), `ZodValidationPipe`, `buildCodedError`, `AuthenticatedGuard` +
  `PermissionsGuard` + `@RequirePermission`, `apiFetch` / `ApiError`,
  `ProtectedRoute allowedRoles`, `NotAuthorized`, `ConfirmDialog`.
- The `community` module must export `COMMUNITY_REPOSITORY` for the
  parent-existence guard. If it does not already, that export is the single
  permitted touch of the `community` module and must be reported as such.
- Reachable PostgreSQL for the migration.
- A running dev server (`npm run dev`) and an authenticated `SYSTEM_ADMIN`
  session for the browser verification required by CLAUDE.md.

## Success Criteria

- [ ] `SYSTEM_ADMIN` can create, list, update and soft-delete an
      `InspectableElement` under a given community — with `elementType`,
      `name`, `description?`, `location`, `serialNumber?` and `installedAt` —
      via API and via the web UI.
- [ ] `GET /communities/:communityId/inspectable-elements` returns **only**
      that community's non-soft-deleted elements; an element registered under
      community A never appears under community B.
- [ ] Creating an element under a non-existent or soft-deleted `communityId` is
      rejected with a 404 carrying `COMMUNITY_NOT_FOUND`; no element row is
      created.
- [ ] Updating or deleting an element id that does not exist, is soft-deleted,
      or belongs to a different community, 404s identically with
      `INSPECTABLE_ELEMENT_NOT_FOUND` — the parent id in the path is enforced,
      not decorative.
- [ ] Two elements in the same community may share the same `name` and
      `location` — no uniqueness error.
- [ ] `serialNumber` may be omitted, duplicated across elements, and is never
      used for lookup.
- [ ] Soft-deleted elements never appear in any list response or list page.
- [ ] Soft-deleting a community with at least one active (non-soft-deleted)
      `InspectableElement` attached is rejected with a coded 409
      (`COMMUNITY_HAS_ACTIVE_ELEMENTS`); the community's `deletedAt` stays
      `null` and no element is modified. Soft-deleting a community with only
      soft-deleted elements (or none) succeeds.
- [ ] The UI renders the element type through an i18n label, never the raw
      `EXTINGUISHER` string, in all three locales.
- [ ] `CommunityDetailPage` links to that community's elements, and the elements
      pages are reachable only through a valid community id.
- [ ] `ROLE_PERMISSIONS` still maps `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
      `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` to `[]`, and
      `PermissionChecker.can`'s signature is unchanged — no resource parameter
      was added.
- [ ] Unauthenticated requests get 401; authenticated non-`SYSTEM_ADMIN`
      requests get 403; in the web app a non-admin sees the explicit
      `NotAuthorized` surface, not a redirect.
- [ ] No client code compares against a server-supplied English message string;
      `inspectable-element/error-messages.ts` reads only `ApiError.status` and
      `.code`, guarded by a differential unit test and a `.message` grep.
- [ ] Zero hardcoded UI strings: `inspectableElement.*` keys exist with real
      `en`, `es`, `ca` translations, key-set parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] No `code`, `imageUrl`, `active`, `lastHydrostaticTestAt` or
      `hydrostaticTestCount` column, field or form input exists.
- [ ] The hand-written FK and `communityId` index survive the migration, proven
      by an integration test reading `pg_constraint` / `pg_indexes`.
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server,
      not only test-verified (CLAUDE.md "Verifying UI Changes").

## Open Questions / Deferred

| # | Question | Status | Owner |
|---|---|---|---|
| 1 | **Community soft-delete vs. its elements — cascade.** Settled for this slice as block-only (see Settled product decisions). | **Deferred, settled as a named follow-up.** The product owner's confirmed long-term direction is that community deletion should eventually cascade-soft-delete its elements instead of merely blocking. This slice ships the simpler block-only guard (mirroring `maintenance-company`'s pattern) to stay thin. *Revisit trigger*: an admin workflow needs to retire a whole community (and its elements) in one action instead of manually clearing elements first. | Future slice |
| 2 | **`imageUrl`.** Settled as deferred — confirmed with the product owner. | **Deferred, settled.** No upload/asset-storage capability exists anywhere in the codebase; building it is its own infrastructural slice. *Revisit trigger*: the first time a technician cannot tell two identical extinguishers apart. | Product owner |
| 3 | **URL segment naming.** This slice uses `/communities/:communityId/inspectable-elements`; the domain doc's QR deep link is `.../elements/{code}`. | **Open — `sdd-design` notes, does not build.** They do not conflict: the `code` lookup is globally unique and therefore inherently un-nested, so FR-006 will add a separate flat route regardless. Flagged so FR-006 does not discover an inconsistency it must retrofit. | `sdd-design` |
| 4 | **`active` (decommission) as a distinct state.** Settled as not-in-v1 because it is indistinguishable from soft-delete until reviews exist. | **Deferred, settled.** *Revisit trigger*: FR-007 ships and someone needs an element excluded from new review sessions while keeping it visible with its history. That is the moment the two states genuinely diverge. | Future slice |
| 5 | **`MANAGE_INSPECTABLE_ELEMENTS` for `MANAGER`** and **`COMMUNITY_REPRESENTATIVE` own-community access** — the two halves of FR-004 this slice does not satisfy. | **Deferred, settled.** Both need machinery that does not exist: `User.managerCapabilities` (never built) and a resource-scoped `PermissionChecker` (signature has no room for it). FR-004 stays partially satisfied after this slice, on purpose, exactly as FR-002 does after `maintenance-company`. | Future slice |
| 6 | **A second `ElementType` value.** `BIE`, `EMERGENCY_LIGHTING`, `FIRE_DOOR` are named in the domain doc but not shipped. | **Deferred, settled.** ADR-008 makes adding one a deliberate dev task. Shipping one type proves the enum's shape; shipping four proves nothing extra and multiplies the UI's label and form surface. | Future slice |
| 7 | **No global nav bar.** Carried forward unresolved from `community-minimal-ui` Open Q8 and `maintenance-company` Open Q9. | **Pre-existing gap, out of scope.** Mitigated here for the first time — elements are reachable from `CommunityDetailPage` rather than by URL only — but the underlying gap (users, communities and maintenance companies are still URL-only) is untouched. | Future slice |

## Next step

All open questions from the initial draft are now settled (imageUrl deferred,
community-delete block-only with cascade as a named future follow-up). Run
`sdd-spec` and `sdd-design` (they can run in parallel). `sdd-spec` writes every
settled decision above — base fields only, `EXTINGUISHER`-only enum,
soft-delete as the sole lifecycle action, no uniqueness on `name`/`location`,
informational `serialNumber`, `SYSTEM_ADMIN`-only access, roles staying inert,
and the community-delete block guard (`CommunityHasActiveElementsError` →
`COMMUNITY_HAS_ACTIVE_ELEMENTS`) — as explicit, already-decided requirements,
plus the `authorization` and `community-admin-ui` deltas. `sdd-design` owns the
`ElementType` three-way-declaration seam, the Value Object call, the
nested-route and React Router ordering shapes, and Open Question 3 (URL
segment naming vs. FR-006's future deep link).
