# Proposal: Maintenance Company + `User.maintenanceCompanyId`

## Intent

`MaintenanceCompany` is FR-002 and sits on the ER diagram
(`docs/architecture/domain-model-inspections.md` §MaintenanceCompany), and
**nothing in the codebase knows it exists** — zero matches for "Maintenance"
in `apps/api/prisma/schema.prisma`, no module, no page. Because of that
absence, ADR-011's two maintenance-side roles are stuck: `Role` (Postgres enum
+ `apps/api/src/modules/users/domain/role.ts`) has accepted
`MAINTENANCE_COMPANY_MANAGER` and `MAINTENANCE_TECHNICIAN` since
`user-management-roles`, `POST /users` will happily create them — and there is
**no way to record which company they work for**. `User` has no
`maintenanceCompanyId` column at all. The domain doc's role-dependent field
list is target state, not schema.

That is the gap this slice closes, and only that gap. It makes two things true
end-to-end for the first time:

1. A `MaintenanceCompany` exists as a real entity (Prisma → domain → use cases
   → REST → web UI).
2. A maintenance-side user can be **tied to a real company**, at creation and
   afterwards, with the company's lifecycle protected against orphaning them.

Success looks like: an admin creates "Extintores Levante S.L.", creates a
`MAINTENANCE_TECHNICIAN` user attached to it, later moves that technician to a
different company, and is **refused** — with a specific, actionable message —
when trying to delete a company that still has people in it.

Per ADR-006's 2026-08-25 addendum ("every domain slice includes its own UI"),
the minimal web UI ships **in this change**, not as a retrofit. This is the
first slice where that rule applies from the start, with no backlog behind it.

Context: `[[sdd/maintenance-company/explore]]`,
`openspec/changes/archive/2026-08-25-community/`,
`openspec/changes/archive/2026-08-26-community-minimal-ui/`, ADR-006, ADR-010,
ADR-011, `docs/requirements/functional-requirements.md` FR-002/FR-003.

## Settled product decisions

Closed with the product owner before this proposal. Inputs, not open items.

| Decision | Resolution |
|---|---|
| **Entity shape** | `MaintenanceCompany` = `id`, `name`, `taxId`, `contactInfo`, `deletedAt` (ADR-010). Matches the domain doc's field list, plus soft delete. |
| **`taxId` uniqueness** | **Enforced**, not advisory, among active companies. Partial unique index (`WHERE "deletedAt" IS NULL`, same technique as `CommunityRepresentative`'s exclusivity backstop) — a soft-deleted company's tax id becomes reusable, since re-onboarding the same real company (same legal CIF) after a mistaken or temporary removal must not be permanently blocked. |
| **`taxId` format** | Free text, non-empty, trimmed. No Spanish CIF/NIF checksum validation in this slice — a real compliance decision, deferred. |
| **`contactInfo` shape** | Single free-text field for now. Confirmed direction: a future iteration introduces a dedicated `ContactInfo` entity shared by `Community` and `MaintenanceCompany` for structured contact data — noted as a forward signal, not built here (walking skeleton discipline). |
| **Role change away from a maintenance role** | `maintenanceCompanyId` is left untouched — mirrors `community`'s accepted eligibility drift (enforced by absence, not code). It only changes if the admin explicitly edits it in the same or a later request; a bare role change never touches it. |
| **Who can manage companies** | `SYSTEM_ADMIN` only. FR-002's `MANAGER` + `MANAGE_MAINTENANCE_COMPANIES` half is **explicitly not activated** here — `managerCapabilities` does not exist as a field and building it is its own slice. |
| **Delete with people attached** | **Blocked**, not cascaded. Soft-deleting a company that still has non-deleted users pointing at it is refused with a 409-class domain error, the same shape as `LastSystemAdminError` in `user-management`. The admin must reassign or delete those users first. |
| **Warn-and-choose delete UX** | **Not this slice.** A future "N users will be orphaned — cascade or cancel?" flow is deliberately deferred; this slice ships the hard block only. |
| **`User.maintenanceCompanyId`** | New field on `User`. **Required** when `role` is `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN`; not applicable to the other three roles. Must reference an **existing, non-soft-deleted** company. |
| **Reassignment** | **Editable after creation.** A `SYSTEM_ADMIN` may move a user to a different maintenance company at any time. The domain doc calls this "fixed scope" — that wording is superseded by this decision; it means *scope derives from the company*, not *the company is immutable*. |
| **Role permissions** | Unchanged. `MAINTENANCE_COMPANY_MANAGER` and `MAINTENANCE_TECHNICIAN` stay at `[]` in `role-permission.checker.ts` after this slice. Storing a company id confers **zero** API access. |
| **Company↔community link** | **Not this slice** (see Out of Scope). `CommunityMaintenanceAssignment` is its own follow-up change. |
| **Web UI** | In scope, minimal: list / create / edit pages for companies (mirroring `Community*Page`), plus a role-conditional company field on the existing user create/edit forms. |

## Scope

### In Scope

- **Prisma**: `MaintenanceCompany` model (`id` UUIDv7 per ADR-009, `name`,
  `taxId`, `contactInfo`, `deletedAt`) and a nullable `maintenanceCompanyId`
  column on `User`, with a hand-written FK in `migration.sql` following the
  `20260825120000_add_community_and_assignments` precedent (Prisma models here
  carry no `@relation`; FKs are written by hand with `ON DELETE RESTRICT`).
- **Domain**: hand-written `MaintenanceCompany` entity, zero Prisma dependency
  (ADR-013); the has-attached-users delete-block rule expressed in the domain
  layer, not the controller — mirroring `last-admin.policy.ts`.
- **Application**: repository port + use cases for company CRUD (create / list
  / update / soft-delete), plus the company-existence + not-deleted check
  consumed by user create/update.
- **`user-management` extension**: `maintenanceCompanyId` accepted on `POST
  /users` and `PATCH /users/:id`, conditionally required by role, validated
  against a live company.
- **Presentation**: REST endpoints for `/maintenance-companies` with Zod
  validation via `shared/presentation/pipes/zod-validation.pipe.ts`, Swagger
  annotations, and domain-error → HTTP mapping mirroring `UsersController`.
- **Error codes**: machine-readable `code` on the new 409s from day one
  (`TAX_ID_ALREADY_IN_USE`, `MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`,
  `TRANSACTION_CONFLICT`) — following the `UserErrorCode` /
  `CommunityErrorCode` precedent rather than adding it in a follow-up PR.
- **Authorization**: extend the `Permission` union in
  `shared/application/authorization/permission.ts` with
  `maintenanceCompany:create|read|update|delete` and grant them to
  `SYSTEM_ADMIN` only; the four non-admin rows stay `[]`.
- **Shared validation**: `packages/validation/src/maintenance-company/*.schema.ts`
  (ADR-015), plus the `maintenanceCompanyId` addition to
  `create-user.schema.ts` / `update-user.schema.ts`.
- **Web UI — companies**: `MaintenanceCompaniesListPage`,
  `MaintenanceCompanyCreatePage`, `MaintenanceCompanyEditPage` under
  `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`, reusing `apiFetch`,
  `ConfirmDialog`, `NotAuthorized` and the `ApiError → i18n key` contract
  verbatim from `community-minimal-ui`.
- **Web UI — users**: `UserCreatePage` / `UserEditPage` gain a company
  `<select>` that appears and becomes required **only** when the selected role
  is one of the two maintenance roles, populated from `GET
  /maintenance-companies`.
- **i18n**: real `maintenanceCompany.*` translations in all three locale files
  (`en`, `es`, `ca`), key-set parity enforced by the existing `locales.test.ts`.
- Unit, integration and E2E tests matching the `community` /
  `community-minimal-ui` conventions, plus browser verification of every UI
  criterion per CLAUDE.md's "Verifying UI Changes" rule.

### Out of Scope

- **`CommunityMaintenanceAssignment`** (company↔community join). A separate
  follow-up change. The exploration sized it as comparable to the entire
  archived `community` chain (~8 PRs) because it reproduces the full
  assignment state machine; folding it in here would make this slice
  unreviewable. Note that `CommunityTechnician` (user↔community, already
  shipped) is a **different** concept and is untouched.
- **Any real permission activation** for `MAINTENANCE_COMPANY_MANAGER`
  (ADR-011's scoped CRUD over its own technicians) or `MAINTENANCE_TECHNICIAN`
  (review-visibility scoping). Both roles remain inert beyond holding a
  company id.
- **`MANAGE_MAINTENANCE_COMPANIES` for `MANAGER`** — needs
  `User.managerCapabilities`, which does not exist. Its own slice.
- **Element-type-scoped assignment granularity** — already an open question in
  the domain-model doc, and downstream of the join table this slice does not
  build.
- **The warn-and-choose (cascade vs cancel) delete UX** — settled above as
  deferred; this slice ships the block only.
- **A global nav bar** — pre-existing, separately tracked gap
  (`community-minimal-ui` Open Question 8). Not introduced or closed here.
- Company↔user *listing* from the company side ("show me this company's
  technicians"). Not required by any success criterion below.
- Pagination, filtering, search, audit logging, restore of soft-deleted
  companies.
- Any change to `community`, `CommunityRepresentative` or `CommunityTechnician`.

### Why this scope and not more (ADR-006)

The tempting move is to build the company **and** its community assignments in
one go, because ADR-011 describes technician scope as resolving *through*
`CommunityMaintenanceAssignment`. The walking-skeleton rule says otherwise: the
`community` change itself split `community-management` from
`community-assignments`, and that split is the precedent here — stretched
across two changes rather than two capabilities, because the assignment side is
a whole state machine (eligibility, lifecycle, 409 causes, reactivation), not a
few extra endpoints.

`MaintenanceCompany` + `User.maintenanceCompanyId` is **independently useful
today**: it is the difference between "you can create a technician user" and
"you can create a technician user that means something". Technician
review-scoping stays unresolved after this slice — but it is unresolved *right
now* too, so nothing regresses.

The UI is in scope because ADR-006's addendum makes it non-negotiable for a new
domain slice. It stays minimal — no company detail page, no technician roster
view, because no success criterion needs one.

## Capabilities

### New Capabilities

- `maintenance-company-management`: admin CRUD over maintenance companies —
  create, list, update, soft-delete — with enforced `taxId` uniqueness and the
  refuse-delete-while-users-attached rule.
- `maintenance-company-admin-ui`: the `SYSTEM_ADMIN`-gated web surface for
  maintenance companies — route gating, list, create/edit forms, confirmed
  soft-delete, and the `ApiError → localized message` contract for the new
  error codes.

### Modified Capabilities

- `user-management`: `User` gains `maintenanceCompanyId`. New requirements —
  conditionally required by role, must reference a live company, editable via
  `PATCH /users/:id`, and returned by the user endpoints. New 400/409 causes
  with codes.
- `user-admin-ui`: the create and edit forms gain a role-conditional company
  selector, and the users list/detail surfaces gain the company value.
- `authorization`: the `Permission` union and the `SYSTEM_ADMIN` row of
  `ROLE_PERMISSIONS` gain `maintenanceCompany:*`. Additive and non-breaking;
  the four inert roles remain `[]`.

## Approach

Mirror `apps/api/src/modules/community/**` **exactly** — it is the most recent
reviewed, archived reference implementation of this project's Clean
Architecture layering, and it is itself a mirror of `users`. Cloning it is
cheaper and safer than inventing a third style.

| `apps/api/src/modules/community/**` | → mirrored under `apps/api/src/modules/maintenance-company/**` |
|---|---|
| `domain/community.entity.ts` (no Prisma, ADR-013) | `domain/maintenance-company.entity.ts` |
| `domain/errors/*.error.ts` | `TaxIdAlreadyInUseError`, `MaintenanceCompanyHasActiveUsersError`, `MaintenanceCompanyNotFoundError` |
| `application/ports/*.repository.port.ts` (`Symbol` token) | `MaintenanceCompanyRepositoryPort` |
| `application/use-cases/*.use-case.ts` | create / list / update / soft-delete |
| `application/use-cases/testing/in-memory-*.repository.ts` | in-memory fake with invariant parity |
| `infrastructure/persistence/prisma-*.repository.ts` (extends `soft-deletable.repository.ts`) | same default `deletedAt: null` filter (ADR-010) |
| `infrastructure/persistence/*.mapper.ts` | persistence ↔ domain mapper |
| `presentation/*.controller.ts` + `dto/**` + `*-error-code.ts` | controller, DTOs, `MaintenanceCompanyErrorCode` |
| `community.module.ts` | `maintenance-company.module.ts` |

On the web side, `apps/web/src/maintenance-company/` mirrors
`apps/web/src/community/` (`error-messages.ts` + any label maps) and the three
pages clone their `Community*Page` siblings, including the documented
static-before-dynamic route-ordering comments in `App.tsx`.

Four deliberate proposal-level choices:

1. **The delete block is a domain policy, not an FK.** The hand-written FK
   (`ON DELETE RESTRICT`) protects against *hard* deletes, which this project
   never performs — every delete is `deletedAt = now()`. So the FK cannot
   enforce this rule; a policy object in the domain layer must, reading the
   user side through the existing `users` repository port. Same shape as
   `last-admin.policy.ts`, same 409 surfacing.
2. **The conditional requirement is a domain invariant, not a DB constraint.**
   `maintenanceCompanyId` is nullable at the column level (three of five roles
   must not have one); "required when role is maintenance-side" is a
   cross-column rule Postgres would need a `CHECK` for, and the app must own it
   anyway for the error message. The column stays nullable; the domain refuses
   invalid combinations on write.
3. **Error codes ship with the endpoints, not after.** Both `users-minimal-ui`
   and `community-minimal-ui` had to retrofit `code` discriminators onto
   already-shipped 409s. This slice is the first to have the benefit of that
   hindsight; it pays the cost up front.
4. **The UI never re-implements the conditional requirement's *authority*.**
   The form shows/hides and requires the company field client-side for UX, but
   the server is the only place that decides. No client-side company-liveness
   check, no client-side orphan counting.

### Deferred to `sdd-spec` / `sdd-design` (do not resolve here)

- ~~Whether `taxId`'s unique index is plain or partial~~ — **Resolved**:
  partial (`WHERE "deletedAt" IS NULL`). See Settled product decisions.
- ~~Whether `contactInfo` is a single free-text field or a structured
  object~~ — **Resolved**: free text now; a future `ContactInfo` entity
  shared with `Community` is the intended direction. Whether `name` /
  `taxId` are Value Objects is still open (ADR-006 addendum: decided per
  slice).
- Request sequencing for the user forms, which now need
  `GET /maintenance-companies` in addition to their existing data.
- Whether `MaintenanceCompanyErrorCode` is mirrored in web code a third time or
  hoisted into `@sf-manager/validation`. See Open Question 5.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma`, `migrations/` | Modified | `MaintenanceCompany` model + `User.maintenanceCompanyId` + hand-written FK |
| `apps/api/src/modules/maintenance-company/domain/**` | New | Entity, delete-block policy, errors |
| `apps/api/src/modules/maintenance-company/application/**` | New | Port, CRUD use cases, in-memory fake |
| `apps/api/src/modules/maintenance-company/infrastructure/persistence/**` | New | Prisma adapter (extends `soft-deletable.repository.ts`), mapper |
| `apps/api/src/modules/maintenance-company/presentation/**` | New | Controller, DTOs, `maintenance-company-error-code.ts` |
| `apps/api/src/modules/maintenance-company/maintenance-company.module.ts` | New | Providers + controller wiring |
| `apps/api/src/modules/users/domain/user.entity.ts` | Modified | `maintenanceCompanyId` prop + role-conditional invariant |
| `apps/api/src/modules/users/application/use-cases/{create,update}-user.use-case.ts` | Modified | Validate company reference and role/company consistency |
| `apps/api/src/modules/users/presentation/**` | Modified | DTOs + `UserErrorCode` gain the new causes |
| `apps/api/src/shared/application/authorization/permission.ts` | Modified | Extend `Permission` union |
| `apps/api/src/modules/auth/infrastructure/authorization/role-permission.checker.ts` | Modified | Grant `maintenanceCompany:*` to `SYSTEM_ADMIN` only |
| `packages/validation/src/maintenance-company/**` | New | Zod schemas shared web/API |
| `packages/validation/src/users/{create,update}-user.schema.ts` | Modified | Optional `maintenanceCompanyId` + role-conditional refinement |
| `apps/web/src/api/maintenance-company.ts` | New | Typed calls + mirrored error-code union |
| `apps/web/src/maintenance-company/**` | New | `error-messages.ts`, label maps |
| `apps/web/src/pages/MaintenanceCompan{iesListPage,yCreatePage,yEditPage}.tsx` | New | List, create, edit |
| `apps/web/src/pages/User{Create,Edit}Page.tsx` | Modified | Role-conditional company selector |
| `apps/web/src/App.tsx` | Modified | 3 role-gated routes, static-before-dynamic |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Real `maintenanceCompany.*` translations |
| `apps/api/test/**` | New/Modified | `maintenance-company.e2e-spec.ts` + user e2e additions |

Untouched by design: `apps/web/src/community/**`, `apps/web/src/api/client.ts`,
`components/ConfirmDialog.tsx`, `auth/**` (reused as-is — any needed change is
a finding to report, per the `community-minimal-ui` precedent).

**Correction, post-design**: `apps/api/src/modules/community/community.controller.ts`
is **not** untouched after all. `sdd-design` resolved Open Question 5 (error-code
contract location) by finally acting on the rule-of-three trigger `users-minimal-ui`
and `community-minimal-ui` both raised and deferred: it extracts a shared
`buildCodedError` envelope helper to `shared/presentation/http/coded-error.ts` and
migrates all three current callers — `users`, `community`, and the new
`maintenance-company` controller — onto it. This is a standalone, mechanical,
zero-behavioral-diff refactor (guarded by existing e2e `body.code` assertions),
confirmed with the product owner as an explicit, deliberate exception to this
proposal's original "community untouched" fence. See `design.md`'s Open Question 5
resolution and Risk 1 for the full reasoning and mitigation (isolated PR).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Pre-existing maintenance-role users have no company.** `POST /users` already accepts both roles; any such row violates the new invariant the moment the migration lands | Med | The column is nullable, so the migration itself cannot fail. Open Question 2 settles whether existing rows are grandfathered (readable, but any edit must supply a company) or backfilled/blocked. `sdd-spec` writes the chosen answer as an explicit scenario, not an accident |
| **Role change away from a maintenance role leaves a stale `maintenanceCompanyId`** — the mirror image of the `community` slice's accepted eligibility drift | Med | **Resolved** (see Settled product decisions): left untouched, matching `community`'s accepted-drift precedent. `sdd-spec` writes it as an explicit non-behavior, asserted by a regression test |
| **`taxId` uniqueness collides with soft delete** — deleting a company then re-creating it with the same tax id fails with a confusing "already in use" | Med | **Resolved** (see Settled product decisions): partial unique index chosen. `sdd-spec`/`sdd-design` write an explicit e2e scenario proving a soft-deleted company's tax id becomes reusable |
| **Scope creep toward the company↔community join** — "the company exists now, let's assign it to communities" | High | Explicit non-goal with a stated sizing rationale. `sdd-verify` should assert no `CommunityMaintenanceAssignment` schema, endpoint or page exists |
| **Scope creep toward activating the two roles** — "the technician has a company now, let's scope their reviews" | High | Explicit non-goal. `sdd-verify` asserts `ROLE_PERMISSIONS` still maps all four non-admin roles to `[]` |
| **The delete block is implemented in the controller instead of the domain**, or leaks a raw Prisma count into the use case | Med | Named as proposal-level choice 1 with `last-admin.policy.ts` as the concrete template; `no-restricted-imports` already guards the Prisma half (ADR-013) |
| **The conditional company field is enforced client-side only**, so a direct API call bypasses it | Med | Named as proposal-level choice 4; the invariant lives in the domain and is asserted by an e2e test that posts a maintenance-role user with no company |
| **Race between deleting a company and creating a user pointing at it** — both read "valid" and both commit | Low | Reuse the `transactional()` + `SERIALIZABLE` + `TransactionConflictError` seam already established in `users`; `sdd-design` decides whether this slice needs it or the FK plus a re-read suffices |
| **Enum-like / id-like values rendered raw** — `users-minimal-ui` shipped raw `Role` text and had to patch it; a `maintenanceCompanyId` UUID rendered in the users list would be the same mistake | Med | The users list/detail must render the company **name**, not its id; called out in the success criteria and grep-checked by `sdd-verify` |
| **Reviewer overload** — new API module + `users` changes + 3 new pages + 2 modified pages + migration in one PR | High | `sdd-tasks` must forecast against the 400-line budget; chained PRs (`stacked-to-main`, as in all three prior chains) are the expected outcome |
| ES/CA translations stubbed with English placeholders | Med | Real translations in scope; `locales.test.ts` parity guard extends to `maintenanceCompany.*` |

## Rollback Plan

Revert the branch and roll back the single migration (`prisma migrate reset` in
dev), dropping `MaintenanceCompany` and the `User.maintenanceCompanyId` column
plus its FK. Everything else is additive and self-contained: the new API module
under `apps/api/src/modules/maintenance-company/**`, three new web pages, a new
`apps/web/src/maintenance-company/**` folder, new locale keys, one permission-
union extension and new entries on the `SYSTEM_ADMIN` row.

Two edits are **not** purely additive and must be reverted with care:
`apps/web/src/pages/User{Create,Edit}Page.tsx` and the `users` schemas/DTOs.
Both are backward-compatible in the additive direction (a request without
`maintenanceCompanyId` behaves exactly as today for the three non-maintenance
roles), so reverting them restores current behavior verbatim — but any
maintenance-role user created during the slice's life loses its company
association when the column drops. Since those users are functionally inert
(`[]` permissions), nothing breaks; the association is simply gone.

If the chain is split across PRs, each reverts independently, with the
migration PR as the only one carrying schema state.

## Dependencies

- None new. Reuses `IdGenerator` (UUIDv7, ADR-009), `SoftDeletableRepository`
  (ADR-010), `ZodValidationPipe`, `AuthenticatedGuard` + `PermissionsGuard` +
  `@RequirePermission`, `apiFetch` / `ApiError`, `ProtectedRoute allowedRoles`,
  `NotAuthorized` and `ConfirmDialog`.
- The `users` module gains a field but keeps sole ownership of user creation
  and role assignment; the maintenance-company module reads it, never writes it.
- Reachable PostgreSQL for the migration.
- A running dev server (`npm run dev`) and an authenticated `SYSTEM_ADMIN`
  session for the browser verification required by CLAUDE.md.

## Success Criteria

- [ ] `SYSTEM_ADMIN` can create, list, update and soft-delete a
      `MaintenanceCompany` with `name`, `taxId` and `contactInfo`, via API and
      via the web UI.
- [ ] Creating or updating a company with a `taxId` already held by another
      company is rejected with a 409 carrying `TAX_ID_ALREADY_IN_USE`, and the
      UI shows a tax-id-specific message.
- [ ] Soft-deleted companies never appear in `GET /maintenance-companies` nor
      in the list page, and are not selectable in the user forms.
- [ ] A user can be created with role `MAINTENANCE_COMPANY_MANAGER` or
      `MAINTENANCE_TECHNICIAN` **only** when a valid, non-deleted
      `maintenanceCompanyId` is supplied; omitting it is rejected.
- [ ] Supplying `maintenanceCompanyId` for `SYSTEM_ADMIN`, `MANAGER` or
      `COMMUNITY_REPRESENTATIVE` is rejected (no silent ignore).
- [ ] Supplying a `maintenanceCompanyId` that does not exist, or that points at
      a soft-deleted company, is rejected.
- [ ] A `SYSTEM_ADMIN` can move an existing maintenance-role user to a
      different company via `PATCH /users/:id` and via `UserEditPage`; the new
      company is reflected immediately.
- [ ] Soft-deleting a company that still has at least one non-deleted user
      pointing at it is **refused** with a 409 carrying
      `MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`; the UI tells the admin to
      reassign or delete those users first. No user is modified by the attempt.
- [ ] After reassigning or deleting every such user, the same delete succeeds.
- [ ] Soft-deleted users do **not** block a company's deletion.
- [ ] The company selector appears in `UserCreatePage`/`UserEditPage` **only**
      when the chosen role is one of the two maintenance roles, and disappears
      when the role changes away from them.
- [ ] The users surfaces render the company's **name**, never a raw UUID.
- [ ] `ROLE_PERMISSIONS` still maps `MANAGER`,
      `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN` and
      `COMMUNITY_REPRESENTATIVE` to `[]` — holding a company id grants nothing.
- [ ] Unauthenticated requests to `/maintenance-companies` get 401;
      authenticated non-`SYSTEM_ADMIN` requests get 403; in the web app a
      non-admin sees the explicit `NotAuthorized` surface, not a redirect.
- [ ] No client code compares against a server-supplied English message string;
      `maintenance-company/error-messages.ts` reads only `ApiError.status` and
      `.code`, guarded by a differential unit test and a `.message` grep.
- [ ] Zero hardcoded UI strings: `maintenanceCompany.*` keys exist with real
      `en`, `es` and `ca` translations, key-set parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] No `CommunityMaintenanceAssignment` model, endpoint or page exists.
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server,
      not only test-verified (CLAUDE.md "Verifying UI Changes").

## Open Questions / Deferred

| # | Question | Status | Owner |
|---|---|---|---|
| 1 | **`taxId` uniqueness vs. soft delete.** A plain unique index keeps a soft-deleted company's tax id reserved forever (the shipped `User.email` behavior); a partial index `WHERE "deletedAt" IS NULL` frees it for reuse but allows two rows with the same tax id to coexist in history. | **Resolved.** Partial unique index (`WHERE "deletedAt" IS NULL`) — a soft-deleted company's tax id is reusable by a re-onboarded instance of the same company. | Resolved |
| 2 | **Existing maintenance-role users with no company.** `POST /users` has accepted both roles since `user-management-roles`. Are pre-existing rows grandfathered (readable, but any edit must supply a company), backfilled to a placeholder, or is the migration gated on there being none? | **Open — `sdd-spec` decides.** The column is nullable so the migration is safe either way; this is a product rule, not a schema problem. Proposed direction: grandfather and require on next write, since these users are functionally inert today. | `sdd-spec` |
| 3 | **Role change away from a maintenance role.** When `PATCH /users/:id` changes a technician to `MANAGER`, is the stale `maintenanceCompanyId` cleared automatically, or is the change rejected unless the caller clears it explicitly? | **Resolved.** Left untouched — mirrors `community`'s accepted eligibility drift. No auto-clear, no rejection; only an explicit edit of `maintenanceCompanyId` itself changes it. | Resolved |
| 4 | **`taxId` and `contactInfo` shape.** Is `taxId` a validated Spanish CIF/NIF (format + checksum) or a trimmed, non-empty, unique free-text string? Is `contactInfo` free text or structured (`email`/`phone`/`address`)? | **Resolved.** Both free text. `taxId`: non-empty, trimmed, no checksum. `contactInfo`: single field now; a future `ContactInfo` entity shared with `Community` is the intended direction, not built in this slice. | Resolved |
| 5 | **Error-code contract location.** `users-minimal-ui` set a rule-of-three trigger: hoist a shared error-code contract into `@sf-manager/validation` when a further consumer needs its own codes. `community-minimal-ui` mirrored again and re-flagged it. **This slice is the third consumer.** | **Open — `sdd-design` decides**, and must address the trigger explicitly rather than silently mirroring a third time. | `sdd-design` |
| 6 | **Warn-and-choose delete UX.** Instead of a hard block, show "N users are attached — cascade-detach or cancel?" | **Deferred, settled** — this slice ships the block only. *Revisit trigger*: the first complaint that reassigning users one by one before deleting a company is too tedious. | Future slice |
| 7 | **`CommunityMaintenanceAssignment` and the ADR-011 scoping question.** The exploration flagged a real drift: ADR-011 resolves technician review scope through a company↔community join, but only the user-level `CommunityTechnician` is shipped. | **Deferred to the follow-up slice, deliberately.** This slice neither builds the join nor supersedes ADR-011 — it is a recorded open decision, not an omission. The follow-up change must either build the join or add an ADR-011 addendum accepting `CommunityTechnician` as the de facto mechanism. | Future slice |
| 8 | **`MANAGE_MAINTENANCE_COMPANIES` for `MANAGER` (FR-002's second half)** and `MAINTENANCE_COMPANY_MANAGER`'s scoped CRUD over its own technicians (ADR-011 Decision 1). | **Deferred** — both need `User.managerCapabilities` and real scoped-permission machinery, neither of which exists. FR-002 stays partially satisfied after this slice, on purpose. | Future slice |
| 9 | **No navigation entry point.** `/maintenance-companies` will be a third URL-only-reachable section. | **Pre-existing gap, out of scope** — `community-minimal-ui` Open Question 8 said the next UI slice should either add a minimal nav or record why not. Recording why not: this slice already carries a migration, a new API module, a `users` change and five pages; a nav bar is a fourth concern with its own layout decisions. | Future slice |

## Next step

Run `sdd-spec` and `sdd-design` (they can run in parallel). `sdd-design` owns
Open Question 5 (error-code contract location), plus the concurrency and
value-object calls. `sdd-spec` owns Open Question 2 (existing
maintenance-role users with no company), and writes the settled decisions —
enforced `taxId` uniqueness via partial index (reusable after soft-delete),
free-text `taxId`/`contactInfo`, hard delete-block with reassign-first
guidance, role-conditional and editable `maintenanceCompanyId` (untouched on
a bare role change), `SYSTEM_ADMIN`-only access, roles staying inert — as
explicit, already-decided requirements, plus the `user-management`,
`user-admin-ui` and `authorization` deltas.
