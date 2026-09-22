# Proposal: Organization Profile (FR-013 / ADR-012)

## Intent

FR-013 is `identified` and **nothing in the codebase knows this entity
exists** — no Prisma model, no module, no page. ADR-012 (Accepted) already
decided *what* it is: the property management company's own corporate data
(legal name, tax ID, address, contact info, logo) modelled as a **singleton
domain entity** stored in the database and edited through the app's own
authenticated flow, explicitly *not* as a config file on the VPS.

The gap this slice closes, and only that gap: the data compliance reports
will eventually need has **no home and no way to be entered**. Today it
lives nowhere; the only workaround available to an operator is editing a
file on the server — exactly what ADR-012 rejected, because it bypasses
authn/authz entirely and leaves no trace of who changed the legal name
printed on a signed document.

Success looks like: a `SYSTEM_ADMIN` opens **Organization profile** in the
nav, sees a screen telling them the profile is not filled in yet, types the
company's real name / legal name / tax ID / address / phone / email, saves,
and the values persist and are readable through the API. No server access,
no redeploy.

Per ADR-006's 2026-08-25 addendum, the minimal web UI ships **in this
change**, not as a retrofit.

Context: `[[sdd/organization-profile/explore]]`, ADR-012, ADR-011, ADR-010,
ADR-009, ADR-006, FR-013,
`openspec/changes/archive/2026-09-15-review-history-manager-capability/`,
`openspec/changes/archive/2026-08-31-maintenance-company/`.

## Settled product decisions

Closed with the product owner before this proposal. Inputs, not open items.

| Decision | Resolution |
|---|---|
| **Who can manage it** | `SYSTEM_ADMIN` only. FR-013's `MANAGER` + `MANAGE_ORGANIZATION_PROFILE` half is **explicitly not activated** here — same two-slice split as FR-001/002/004/005 and, most directly, FR-008 (`review-history-manager-capability` shipped the capability route as its own later chain). ADR-011's own text says the five undeclared `ManagerCapability` members "remain undeclared until their own slices". |
| **Field set** | Exactly ADR-012's list: `name`, `legalName`, `taxId`, `address`, `phone`, `email`, plus `logoAssetId` (nullable, reserved, inert). **No additional fields.** |
| **Logo** | **Not in this slice.** `logoAssetId` exists in schema/entity/response as a permanently-`null` reserved column. No object storage, no upload endpoint, no upload UI. ADR-012's own Consequences section already says the field is "reserved now so the entity doesn't need a later migration" — this slice honours that literally. |
| **`taxId` format** | Free text, non-empty, trimmed. No NIF/CIF checksum validation — same call `maintenance-company` made for the same field. |
| **Singleton bootstrap** | The row is **created by a database migration** (raw-SQL `INSERT` with a hardcoded UUIDv7 literal), seeded with **blank values**. Not lazily created on first `PATCH`, and **not** via `apps/api/prisma/seed.ts` (production-gated off, so it cannot guarantee the row exists). Consequence: `GET` never 404s and no use case needs a does-it-exist-yet branch. |
| **Blank-seed semantics** | The seeded row is **valid to read, incomplete to look at**. Each field is `''` on seed; any field *supplied* to `PATCH` must be non-empty and trimmed. The settings page shows a "profile not completed yet" state until the six fields are filled. This grandfathering is deliberate, not an accident of the migration. |
| **API surface** | `GET /organization-profile` and `PATCH /organization-profile`. **No POST** (nothing to create), **no DELETE** (ADR-010: no `deletedAt`, the row must always exist), **no `:id` param** (one implicit resource). Deliberately unlike every other admin module in the repo. |
| **Report blocking** | An incomplete profile blocks nothing. There is no report generation yet (no FR-010), so a "reports require a complete profile" rule would guard nothing. Out of scope. |
| **Web UI** | In scope, minimal: **one** page — view + edit form combined. No list page, no create page, no delete control (there is nothing to list, create or delete). |

## Naming decision (resolved here, do not re-open in spec)

The exploration flagged the ambiguity: ADR-012 names the entity
`PropertyManagementCompany`; the change slug and FR-013's wording say
*organization profile*.

Precedent check: `maintenance-company` derives module (`maintenance-company`),
route (`/maintenance-companies`) and permission (`maintenanceCompany:*`) from
the entity name, while `user-management-roles` shows the **change slug is not
the module name** (`User` → `users` → `/users` → `user:*`). So the rule the
repo actually follows is *one name, derived from the entity; the change slug
is free*.

**Resolution: one name — `OrganizationProfile` — used everywhere in code**:
Prisma model `OrganizationProfile`, domain entity `OrganizationProfile`,
module `apps/api/src/modules/organization-profile/`, route
`/organization-profile`, permissions `organizationProfile:read|update`, web
page `OrganizationProfilePage`, i18n namespace `organizationProfile.*`.

Why this name and not `PropertyManagementCompany`:

1. It is **already the project's own vocabulary** for this feature — ADR-012
   itself introduces the capability as `MANAGE_ORGANIZATION_PROFILE`, and
   ADR-011 already lists that constant. Naming the code `PropertyManagementCompany`
   would put a second name next to a constant the repo has held for months.
2. **`/property-management-company` sitting next to `/maintenance-companies`
   in the same admin nav is a genuine UX hazard** — two "company" sections,
   one of which is not a company list at all.
3. This screen is **settings about ourselves**, not a managed catalog.
   Naming it after an entity implies a CRUD section parallel to
   `/maintenance-companies`, which is exactly what it must not look like.

**Cost, paid explicitly**: a one-paragraph addendum to
`docs/adr/ADR-012-...md` recording that the implementation name is
`OrganizationProfile`, with this rationale — so the ADR and the code do not
silently drift. ADR-012's decision (domain entity, singleton, field set, no
`deletedAt`) is untouched; only the identifier is pinned.

## Scope

### In Scope

- **Prisma**: `OrganizationProfile` model — `id` (UUIDv7, ADR-009), `name`,
  `legalName`, `taxId`, `address`, `phone`, `email`, `logoAssetId` (nullable).
  **No `deletedAt`** (ADR-010).
- **Migration**: `CREATE TABLE` plus an idempotent single-row `INSERT` with a
  hardcoded UUIDv7 and blank field values, in the same hand-written-SQL style
  as `20260914090000_add_user_manager_capabilities`.
- **Domain**: hand-written `OrganizationProfile` entity, zero Prisma
  dependency (ADR-013).
- **Application**: `OrganizationProfileRepositoryPort` + exactly two use
  cases — `GetOrganizationProfileUseCase`, `UpdateOrganizationProfileUseCase`
  — plus the in-memory fake.
- **Infrastructure**: Prisma adapter + mapper. **Not** extending
  `soft-deletable.repository.ts` (no `deletedAt`).
- **Presentation**: `GET` / `PATCH /organization-profile`, Zod validation via
  `ZodValidationPipe`, Swagger annotations, `buildCodedError` for any domain
  error (the shared helper already extracted by `maintenance-company`).
- **Authorization**: extend the `Permission` union with
  `organizationProfile:read` and `organizationProfile:update` — **two, not
  four**, because there is no create and no delete verb to guard — granted on
  the `SYSTEM_ADMIN` row only; all four other roles stay `[]`.
- **Shared validation**: `packages/validation/src/organization-profile/update-organization-profile.schema.ts`
  (ADR-015), mirroring `updateMaintenanceCompanySchema`'s optional-field PATCH
  shape.
- **Web UI**: `OrganizationProfilePage` (view + edit in one page) under
  `allowedRoles: ['SYSTEM_ADMIN']`, reusing `apiFetch` / `ApiError` /
  `NotAuthorized`, with an explicit "not completed yet" state on the blank
  seeded row.
- **Nav**: one `ORGANIZATION_PROFILE` item added to the `SYSTEM_ADMIN` row of
  `NAV_ITEMS_BY_ROLE`, satisfying `nav-items.reachability.test.ts`.
- **i18n**: real `organizationProfile.*` + `nav.organizationProfile`
  translations in `en`, `es`, `ca`, key-set parity enforced by
  `locales.test.ts`.
- **Docs**: ADR-012 naming addendum; FR-013 status → `partial`.
- Unit, integration and E2E tests to the `maintenance-company` standard, plus
  browser verification of every UI criterion (CLAUDE.md).

### Out of Scope

- **`MANAGER` + `MANAGE_ORGANIZATION_PROFILE`.** Declaring the capability
  enum member, the checker wiring, the grant/revoke UI and the second
  authorization path are their own slice — the shape is already proven by
  `review-history-manager-capability`. FR-013 stays partially satisfied on
  purpose.
- **Logo upload and all object storage.** No MinIO/S3 service exists in
  `docker-compose.yml`; standing one up means bucket layout, credentials and
  access-URL design — ADR-012 explicitly defers all of it. `logoAssetId`
  stays reserved and null.
- **Any use of this data.** No report rendering, no header/branding surface,
  no "profile must be complete before X" rule. Nothing consumes the profile
  after this slice; that is the point of a walking-skeleton slice.
- **`taxId` NIF/CIF validation**, uniqueness (meaningless for a single row),
  audit trail of who changed what, change history, and restore.
- **A public/unauthenticated read** of the company profile.
- Any change to `users`, `community`, `maintenance-company`,
  `review-session` or `review-history`.

### Why this scope and not more (ADR-006)

Two temptations, both refused. **Shipping the `MANAGER` route now** would
widen a two-use-case slice into capability-checker wiring plus user-form work
for a capability nobody has asked to delegate yet — and ADR-011's text names
this exact enum member as deferred. **Shipping the logo** would drag a brand
new infrastructure service into the thinnest slice in the project so far, in
direct contradiction of the governing ADR's own Consequences section.

What is left is genuinely useful today: the corporate data has a home, an
owner, and an in-app edit path, which is strictly more than the zero it has
now.

## Capabilities

### New Capabilities

- `organization-profile-management`: the singleton corporate profile — its
  guaranteed existence, its field set, `SYSTEM_ADMIN`-only read and partial
  update over `GET`/`PATCH /organization-profile`, the absence of create and
  delete, and the blank-seed / non-empty-on-write rule.
- `organization-profile-admin-ui`: the `SYSTEM_ADMIN`-gated settings surface —
  route gating, the combined view/edit page, the not-completed-yet state, and
  the `ApiError → localized message` contract.

### Modified Capabilities

- `authorization`: `Permission` union and the `SYSTEM_ADMIN` row of
  `ROLE_PERMISSIONS` gain `organizationProfile:read|update`. Additive; the
  four non-admin rows stay `[]`.
- `app-navigation`: the `SYSTEM_ADMIN` nav row gains one item. No other role
  row changes; reachability invariant preserved.

## Approach

Mirror `apps/api/src/modules/maintenance-company/**` — the most recent
archived reference implementation of this project's hexagonal layering — and
then **delete everything the singleton does not need**. Concretely: no
create/delete use cases, no `:id` param, no `SoftDeletableRepository`, no
list endpoint, no uniqueness policy, no deletion policy.

Three proposal-level choices:

1. **Existence is a deployment guarantee, not a runtime branch.** The
   migration inserts the row; the application never creates it. This keeps
   `GetOrganizationProfileUseCase` a straight read and removes an entire
   class of "first PATCH races second PATCH into creating two rows" bugs. The
   price is that a hand-rolled database (outside migrations) has no profile —
   acceptable, since every environment runs migrations.
2. **Two permissions, not four.** Copying `maintenanceCompany:*`'s four-verb
   granularity would declare `organizationProfile:create|delete` guarding
   endpoints that will never exist. The granularity that matters here is
   read-vs-update, which is exactly what a future `MANAGER` capability slice
   will need to split.
3. **The incompleteness signal is UI-only.** The API returns blank strings
   without comment; the page decides to say "please complete this". No
   server-side "profile is incomplete" flag, because nothing server-side acts
   on it yet.

### Deferred to `sdd-spec` / `sdd-design` (do not resolve here)

- How the repository reads the single row (`findFirst`, or by the migration's
  literal id) and whether a DB-level single-row guard is worth its weight —
  **`sdd-design`**.
- Whether `email` / `phone` / `taxId` become Value Objects in this slice
  (ADR-006 addendum: decided per slice) — **`sdd-design`**.
- Exact `PATCH` semantics for explicit `null` vs omitted vs `''`, and whether
  a no-op `PATCH` is 200 — **`sdd-spec`**.
- Whether `logoAssetId` appears in the `GET` response at all, or is hidden
  until the upload slice — **`sdd-spec`**.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modified | `OrganizationProfile` model, no `deletedAt` |
| `apps/api/prisma/migrations/<ts>_add_organization_profile/` | New | `CREATE TABLE` + idempotent single-row seed `INSERT` |
| `apps/api/src/modules/organization-profile/domain/**` | New | Entity (+ any errors) |
| `apps/api/src/modules/organization-profile/application/**` | New | Port, 2 use cases, in-memory fake |
| `apps/api/src/modules/organization-profile/infrastructure/persistence/**` | New | Prisma adapter + mapper |
| `apps/api/src/modules/organization-profile/presentation/**` | New | Controller, DTOs, error codes |
| `apps/api/src/modules/organization-profile/organization-profile.module.ts` | New | Providers + controller wiring |
| `apps/api/src/app.module.ts` | Modified | Register the module |
| `apps/api/src/shared/application/authorization/permission.ts` | Modified | `organizationProfile:read|update` |
| `apps/api/src/modules/auth/infrastructure/authorization/role-permission.checker.ts` | Modified | Grant both to `SYSTEM_ADMIN` only |
| `packages/validation/src/organization-profile/**` | New | Zod PATCH schema, shared web/API |
| `apps/web/src/api/organization-profile.ts` | New | `getOrganizationProfile`, `updateOrganizationProfile` |
| `apps/web/src/pages/OrganizationProfilePage.tsx` | New | View + edit, single page |
| `apps/web/src/routes/authenticated-routes.tsx` | Modified | One route, `allowedRoles: ['SYSTEM_ADMIN']` |
| `apps/web/src/layout/nav-items.ts` | Modified | One item on the `SYSTEM_ADMIN` row |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | `organizationProfile.*`, `nav.organizationProfile` |
| `docs/adr/ADR-012-...md` | Modified | Naming addendum |
| `docs/requirements/functional-requirements.md` | Modified | FR-013 → `partial` |
| `apps/api/test/organization-profile.e2e-spec.ts` | New | Auth, authz, GET, PATCH, validation |

Untouched by design: `docs/adr/ADR-011-...md` (this slice declares no
`ManagerCapability` member — the addendum belongs to the follow-up slice, the
way `review-history-manager-capability` wrote its own), and every existing
module.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **The seeded row is missing** in an environment where the migration was skipped or the table was created by hand — every `GET` 500s or returns nothing | Low | Migration `INSERT` is part of the same migration as `CREATE TABLE`, so they cannot diverge; an integration test asserts exactly one row exists after `migrate deploy`, mirroring `maintenance-company-migration.integration.spec.ts` |
| **A second row appears** (hand-inserted, or a future lazy-create) and the repository silently picks an arbitrary one | Low | No API path creates rows; `sdd-design` decides the deterministic read strategy and whether a DB-level guard is warranted |
| **Scope creep toward the logo** — "the field is right there, uploading is easy" | High | Explicit non-goal with the ADR quoted; `sdd-verify` asserts no object-storage client, no `docker-compose.yml` service, and no upload endpoint or input exists |
| **Scope creep toward the `MANAGER` capability** — "declaring one enum member is one line" | Med | Explicit non-goal; `sdd-verify` asserts `ManagerCapability` still declares only `VIEW_ALL_REVIEWS` and the four non-admin `ROLE_PERMISSIONS` rows are still `[]` |
| **Over-built as a 4-verb CRUD** by pattern-matching `maintenance-company` — a list page, a create form, a delete button for a singleton | Med | Named explicitly in Settled decisions and Approach; `sdd-verify` asserts no `POST`/`DELETE` route, no `:id` param, and exactly one page |
| **Blank-seed UX ships as a silently empty form**, so the admin cannot tell "nothing entered yet" from "loading failed" | Med | The not-completed-yet state is a success criterion and a browser-verified one, not an implementation detail |
| **Two names in the tree** (`OrganizationProfile` in code vs `PropertyManagementCompany` in ADR-012) | Med | The ADR-012 addendum is in scope for this slice specifically to close this; `sdd-verify` greps for `PropertyManagementCompany` in `apps/**` and expects zero hits |
| ES/CA translations stubbed with English placeholders | Med | Real translations in scope; `locales.test.ts` parity covers the new namespace |
| **Reviewer overload** | Low | Smallest domain slice to date — one migration, two use cases, one page. `sdd-tasks` still forecasts against the 400-line budget |

## Rollback Plan

Revert the branch and roll back the single migration, dropping the
`OrganizationProfile` table (no other table references it — no FK, no
`deletedAt`, nothing reads it). Everything else is purely additive and
self-contained: a new API module, a new web page, one new route, one nav
entry, one new locale namespace, one `Permission` union extension and two new
entries on the `SYSTEM_ADMIN` row.

No existing behaviour changes, so reverting restores current behaviour
verbatim; the only loss is whatever corporate data was entered during the
slice's life, which nothing consumes yet.

If the chain is split across PRs, each reverts independently, with the
migration PR as the only one carrying schema state.

## Dependencies

- None new. Reuses `IdGenerator` (UUIDv7, ADR-009), `ZodValidationPipe`,
  `buildCodedError`, `AuthenticatedGuard` + `PermissionsGuard` +
  `@RequirePermission`, `apiFetch` / `ApiError`, `ProtectedRoute
  allowedRoles`, `NotAuthorized`, `AppLayout` nav.
- Reachable PostgreSQL for the migration.
- A running dev server (`npm run dev`) and an authenticated `SYSTEM_ADMIN`
  session for the browser verification CLAUDE.md requires.

## Success Criteria

- [ ] After `prisma migrate deploy` on an empty database, exactly one
      `OrganizationProfile` row exists, with blank fields and `logoAssetId`
      null — **without any application request having been made**.
- [ ] `GET /organization-profile` as `SYSTEM_ADMIN` returns that row. It
      never 404s, at any point in the lifecycle.
- [ ] `PATCH /organization-profile` updates any subset of `name`,
      `legalName`, `taxId`, `address`, `phone`, `email`; unsupplied fields
      are untouched.
- [ ] A supplied field that is empty or whitespace-only is rejected with a
      400; `taxId` is accepted as free text with no format rule.
- [ ] `logoAssetId` cannot be written through the API and stays null.
- [ ] There is **no** `POST` and **no** `DELETE` on `/organization-profile`,
      and no `:id`-parameterised variant of the route.
- [ ] Unauthenticated requests get 401; authenticated non-`SYSTEM_ADMIN`
      requests (all four other roles) get 403.
- [ ] `ROLE_PERMISSIONS` still maps `MANAGER`,
      `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN` and
      `COMMUNITY_REPRESENTATIVE` to `[]`.
- [ ] `ManagerCapability` still declares only `VIEW_ALL_REVIEWS`; no
      `MANAGE_ORGANIZATION_PROFILE` member is added.
- [ ] A `SYSTEM_ADMIN` sees an **Organization profile** nav entry; no other
      role does, and `nav-items.reachability.test.ts` passes.
- [ ] On the blank seeded row the page shows an explicit not-completed-yet
      state, distinguishable from a loading or error state.
- [ ] A `SYSTEM_ADMIN` fills all six fields in the browser, saves, reloads,
      and sees the saved values.
- [ ] A non-admin reaching `/organization-profile` by URL sees the explicit
      `NotAuthorized` surface, not a redirect.
- [ ] No client code compares against a server-supplied English message
      string.
- [ ] Zero hardcoded UI strings: `organizationProfile.*` and
      `nav.organizationProfile` exist with real `en`/`es`/`ca` translations.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] No object-storage dependency, service, endpoint or upload control
      exists anywhere in the diff.
- [ ] `grep -r PropertyManagementCompany apps/` returns nothing; ADR-012
      carries the naming addendum.
- [ ] API and web suites, lint and build all pass; every UI criterion is
      **browser-verified**, not only test-verified.

## Open Questions / Deferred

| # | Question | Status | Owner |
|---|---|---|---|
| 1 | **Implementation name** — `OrganizationProfile` (chosen) vs ADR-012's `PropertyManagementCompany`. | **Resolved above**, with an ADR-012 addendum in scope. Worth one product-owner glance before `sdd-spec`, since it pins an identifier across schema, routes and docs. | Resolved |
| 2 | **Deterministic single-row read** — `findFirst` vs reading the migration's literal id, and whether a DB-level single-row guard (e.g. a `UNIQUE` sentinel column) earns its keep. | **Open — `sdd-design` decides.** | `sdd-design` |
| 3 | **Value Objects for `email` / `phone` / `taxId`.** | **Open — `sdd-design` decides** per ADR-006's per-slice rule. Proposed direction: plain trimmed strings, consistent with `maintenance-company`. | `sdd-design` |
| 4 | **`PATCH` edge semantics** — explicit `null`, omitted, `''`, and the no-op update. | **Open — `sdd-spec` decides.** | `sdd-spec` |
| 5 | **`logoAssetId` in the `GET` response** — exposed as always-null, or omitted until the upload slice. | **Open — `sdd-spec` decides.** Proposed direction: omit from the response DTO, so no client learns to depend on a field that has no meaning yet. | `sdd-spec` |
| 6 | **`MANAGER` + `MANAGE_ORGANIZATION_PROFILE`** (FR-013's second half). | **Deferred to its own slice**, following `review-history-manager-capability` exactly — including writing the ADR-011 addendum there, not here. | Future slice |
| 7 | **Logo upload + object storage.** | **Deferred**, per ADR-012's own Consequences. *Revisit trigger*: the first report-rendering slice that actually needs a logo. | Future slice |
| 8 | **Profile completeness as a precondition for report generation.** | **Deferred** — there is no FR-010/report generation to gate. *Revisit trigger*: the report-generation slice. | Future slice |
| 9 | **Audit trail of profile edits** (ADR-012's rationale leans on "who changed it and when", which this slice does not actually record). | **Deferred, and flagged honestly** — the slice delivers the auth half of that rationale, not the audit half. No audit infrastructure exists project-wide. | Future slice |

## Next step

Run `sdd-spec` and `sdd-design` (they can run in parallel). `sdd-design` owns
the single-row read strategy (Q2) and the Value Object call (Q3). `sdd-spec`
owns the `PATCH` edge semantics (Q4) and the `logoAssetId` response shape
(Q5), and writes the settled decisions — `SYSTEM_ADMIN`-only, two-verb API,
migration-seeded blank row, non-empty-on-write, inert `logoAssetId`, free-text
`taxId`, single combined settings page — as already-decided requirements,
plus the `authorization` and `app-navigation` deltas.
