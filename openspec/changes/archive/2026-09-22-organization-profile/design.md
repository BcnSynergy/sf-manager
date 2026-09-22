# Design: Organization Profile (FR-013 / ADR-012)

## Technical Approach

Mirror `apps/api/src/modules/maintenance-company/**` layer-for-layer and
delete everything a singleton does not need (proposal, Approach). What is
left is genuinely small: one table, one hand-written entity, a two-method
port, two one-line use cases, two routes, one page.

The whole design turns on one structural choice. The proposal makes the row's
existence a **deployment guarantee** rather than a runtime branch; this design
makes its **uniqueness** a deployment guarantee too, in the database, so that
"there is exactly one row" is a fact the adapter can address rather than a
hope it has to survive. Everything downstream — a `| null`-free port, a
branch-free `Get` use case, a single-statement `Update`, an in-memory fake
that structurally cannot hold two rows — falls out of that one decision.

The repo's own instinct applies verbatim: *use the constraint where it fits,
use the domain where it does not, and never pretend a mechanism enforces
something it structurally cannot* (`maintenance-company/design.md`, Technical
Approach). Here the constraint fits.

## Architecture Decisions

### Decision 1 (Open Question 2): the singleton is enforced by the database, and that guard is what gives the adapter a unique addressing key

The proposal's stated risk is *"a second row appears (hand-inserted, or a
future lazy-create) and the repository silently picks an arbitrary one."*

| Option | Tradeoff | Verdict |
|---|---|---|
| `findFirst()`, trusting that only one row exists | Deterministic exactly as long as the assumption holds, and silently wrong the moment it does not — which is precisely the failure mode being mitigated. The mitigation *is* the assumption | **Rejected** |
| `findUnique({ id: '<literal UUID>' })`, the migration's id duplicated as a TypeScript constant | Deterministic at the read, but prevents nothing: a rogue second row still exists, now unobserved rather than arbitrarily picked. Worse, it plants a magic UUID that must match the migration forever; if it ever drifts, `GET` resolves to nothing and the "does it exist" branch the proposal deleted comes straight back | **Rejected** |
| Sentinel column `singleton BOOLEAN NOT NULL DEFAULT true`, `UNIQUE("singleton")` + `CHECK ("singleton")` | A second row is **structurally impossible** — `true` collides on the unique index, `false` is refused by the CHECK — regardless of who inserts it (hand-insert, seed script, a future lazy-create bug). And the unique column is a legal Prisma `where`, so the adapter gets typed `findUnique`/`update` with **no literal id in application code** | **Chosen** |
| `CHECK ("id" = '<literal>'::uuid)` instead of the sentinel | Same structural guarantee with no extra column, but the only unique addressing key is then the id itself — back to the magic constant, or to raw SQL for every write | **Rejected** |

The guard is not merely defensive, which is what earns it its keep: it is the
thing that makes `update()` a single atomic typed statement instead of a
read-then-merge. The cost is one inert boolean column the domain never sees
(the mapper simply does not map it) plus one Prisma-invisible CHECK — a
constraint class this schema already carries (`ElementReviewEntry_
observations_not_blank`) with the established WARNING-comment + `pg_constraint`
integration-guard treatment.

**Consequence for the port**: `get()` returns `Promise<OrganizationProfile>`,
**not** `| null`. A missing row is an environment defect, not a runtime
condition; the adapter is the only layer that can observe it and throws
`OrganizationProfileMissingError`, which the controller deliberately does
**not** map — Nest returns 500. A skipped migration must be loud, and `GET`
still never 404s (success criterion), because 404 is not in the mapping table
at all.

### Decision 2 (Open Question 3): all six fields are plain trimmed strings — no Value Objects

Checked before deciding, not assumed: the domain layer contains exactly one
Value Object, `users/domain/password.ts`'s `PlainPassword`, and it exists
only for `toString()` redaction over a `#raw` field. There is **no `Email`
VO to reuse** — `User.email`, the field in this codebase with the strongest
possible case (format rule *and* normalization *and* a unique index), is a
plain `string` validated by a shared Zod schema. Not building one here
duplicates nothing.

Per ADR-006's addendum the conclusion is re-derived per field, not copied:

| Field | Invariant | Behaviour beyond validation? | Verdict |
|---|---|---|---|
| `name`, `legalName`, `address` | non-empty, trimmed | None. Never parsed, compared or formatted. `Community.name`/`Community.address` precedent | Plain `string` |
| `taxId` | non-empty, trimmed, free text | `maintenance-company` deferred format/checksum explicitly, and its one real invariant — uniqueness — was a property of the *set*. With a single row even that argument evaporates: there is no set | Plain `string` |
| `phone` | non-empty, trimmed | No format rule is settled, and **nothing reads this profile yet** (proposal: "Any use of this data" is out of scope). A `Phone` VO would encapsulate an invariant no caller has asked for | Plain `string` |
| `email` | non-empty, trimmed, RFC-ish format | The format rule is real, but it is a *validation* rule, and this repo has already routed exactly that rule through `@sf-manager/validation` for the authentication identity. An `Email` VO here would make an inert settings row more strictly typed than the login credential | Plain `string` |

Two normalization calls this slice makes **differently** from
`maintenance-company`, deliberately:

- **`taxId` is trimmed only — not upper-cased.** `taxIdSchema`'s
  `.toUpperCase()` exists to canonicalize for a unique index
  (`maintenance-company/design.md` Decision 3). There is no index and no
  uniqueness here, so upper-casing would silently rewrite the company's own
  CIF as the admin typed it, for no guarantee in return. **Do not import
  `taxIdSchema`** from the `maintenance-company` namespace — declare a local
  `z.string().trim().min(1)`.
- **`email` is trimmed and format-checked, but not lower-cased.**
  `createUserSchema`'s `.toLowerCase()` protects a unique login index. This
  value is contact data destined to be rendered on documents; the local part
  of an address is case-sensitive by spec and there is no uniqueness to
  protect.

*Revisit trigger*: a VO becomes justified when a field grows behaviour — e.g.
the first report-rendering slice needing `phone.formatted()` or
`taxId.region()`. A stricter format rule alone is a Zod `.refine()`, following
`email`'s path, not `PlainPassword`'s.

### Decision 3: `UpdateOrganizationProfileUseCase` does **not** read before it writes

`UpdateMaintenanceCompanyUseCase` does `findById` → `updateById` → merge the
result by hand. That preliminary read exists for exactly one reason: to
produce the 404. There is no 404 here, so copying the shape would buy a second
round trip, a read-then-write window, and a merged result that can report
stale values for fields the request did not touch.

Instead `update(changes)` is **one** statement whose `RETURNING` row is the
authoritative post-state (Prisma's `update()` returns the updated record).
Same instinct as `maintenance-company`'s Decision 2 and its Phase-8 addendum:
push it into a single atomic database statement rather than orchestrating in
the application layer.

Mechanical consequence, handed to `sdd-spec` rather than pre-empted: a PATCH
with an empty body is a valid `UPDATE ... SET` of nothing and naturally
returns 200 with current values. If `sdd-spec` rules a no-op PATCH a 400, the
delta is one guard at the schema/controller — no repository change.

### Decision 4: no error-code union, no `buildCodedError`, no web `error-messages.ts` in this slice

The repo's own coded-error convention (`maintenance-company/design.md`
Decision 1) says **only a status with more than one reachable cause on the
same call gets a code**. Enumerating this module's reachable statuses: 401 and
403 are guard-level, 400 has exactly one cause (schema rejection), there is no
404 (Decision 1), no 409 (nothing to conflict), and the 500 is an environment
defect the client cannot act on. Zero statuses qualify.

So: no `organization-profile-error-code.ts`, no mirrored union in
`apps/web/src/api/organization-profile.ts`, and no
`apps/web/src/organization-profile/error-messages.ts` — a mapper with no
`code` dimension and two status branches belongs inline in the page. This
contradicts the proposal's scope line listing `buildCodedError`; reported as a
finding below. *Revisit trigger*: the first status with two reachable causes.

### Decision 5: the incompleteness signal is derived from the **saved** snapshot, never from form state, and never from the server

Proposal choice 3 keeps the signal UI-only, so there is no `isComplete()`
getter on the entity and no flag on the DTO (both are tempting and both would
leak a UI concern into the domain and the contract).

On the page it is a *derived* value, not a fourth load state — the fetch
succeeded, so "not completed yet" is not a load outcome:

```ts
type LoadState = 'loading' | 'loaded' | 'error';   // as MaintenanceCompanyEditPage
const incomplete = REQUIRED_FIELDS.some((field) => saved[field] === '');
```

It is computed from `saved` — the last server-confirmed snapshot, held in
state **alongside** the six controlled inputs — and never from the live
inputs, or the banner would vanish as the admin types and reappear on a failed
save. After a successful PATCH, `saved` is replaced by the response body, so
the banner clears without a reload. The banner carries its own
`data-testid="organization-profile-incomplete"`, distinct from
`-loading` and `-error-state`, which is what makes the three states
distinguishable per the success criterion.

Two further page-level consequences, both deliberate:

- **The payload omits empty fields.** On the blank seeded row an admin who
  fills three of six must be able to save; sending `''` for the other three
  would 400 (non-empty-on-write). The page therefore builds the request from
  trimmed non-empty values only. If nothing is filled, it does not call the
  API at all and shows the local validation message.
- **Therefore clearing a field in the UI cannot blank it in the database.**
  Once set, a field can be changed but never emptied — a direct product
  consequence of the settled non-empty-on-write rule, surfaced here rather
  than discovered at apply time. Flagged to `sdd-spec`.
- **No `navigate()` after save.** Every other edit page returns to its list;
  there is no list here. The page stays put and shows a success indication.

## Data Flow

    GET /organization-profile
    AuthenticatedGuard → PermissionsGuard('organizationProfile:read') → Controller
         ▼ GetOrganizationProfileUseCase        [no branch — Decision 1]
         ▼ repo.get()
             ├ findUnique({ singleton: true }) → mapper → entity   → 200
             └ null (migration skipped)        → OrganizationProfileMissingError
                                                 → unmapped → 500, loudly
         ▼ OrganizationProfileResponseDto

    PATCH /organization-profile
    AuthenticatedGuard → PermissionsGuard('organizationProfile:update') → Controller
         │ ZodValidationPipe(updateOrganizationProfileSchema)
         │   └ 6 optional fields, each .trim().min(1); email also .pipe(z.email())
         │   └ unknown keys STRIPPED by z.object's default → `logoAssetId`
         │      sent by a client is discarded, never written (no explicit guard
         │      needed; the field simply has no schema key)
         ▼ UpdateOrganizationProfileUseCase      [no preliminary read — Decision 3]
         ▼ repo.update(changes)
             └ ONE UPDATE ... WHERE "singleton" = true, returning the post-state
         ▼ OrganizationProfileResponseDto

## Interfaces / Contracts

```ts
// application/ports/organization-profile.repository.port.ts
export interface OrganizationProfileChanges {
  name?: string; legalName?: string; taxId?: string;
  address?: string; phone?: string; email?: string;
  // No logoAssetId: reserved and inert (ADR-012 Consequences). Absent from
  // this type, from the Zod schema and from the DTO, so it is unwritable by
  // construction rather than by a rejection rule.
}

export interface OrganizationProfileRepository {
  // NOT `| null`. Existence is a deployment guarantee (migration seed) and
  // uniqueness a structural one (Decision 1's CHECK + unique index), so the
  // absence of the row is an environment defect, not a runtime condition:
  // the adapter throws OrganizationProfileMissingError. No findById — there
  // is nothing to address.
  get(): Promise<OrganizationProfile>;

  // Single atomic UPDATE addressed by the sentinel unique key; resolves to
  // the authoritative post-state (Decision 3). No id parameter.
  update(changes: OrganizationProfileChanges): Promise<OrganizationProfile>;

  // No create(), no softDeleteById(), no findAll(), no transactional().
}

export const ORGANIZATION_PROFILE_REPOSITORY = Symbol('ORGANIZATION_PROFILE_REPOSITORY');
```

```ts
// domain/organization-profile.entity.ts — hand-written, zero Prisma (ADR-013).
// No deletedAt / isDeleted (ADR-010, ADR-012). No createdAt/updatedAt:
// ADR-012's field list is exhaustive and the audit half is deferred
// (proposal Open Question 9) — do not pattern-match User's timestamps.
// No `singleton`: the guard column is persistence-only, never mapped.
// No isComplete(): the incompleteness signal is UI-only (Decision 5).
// No constructor validation, mirroring MaintenanceCompany/Community/User.
export interface OrganizationProfileProps {
  id: string;
  name: string; legalName: string; taxId: string;
  address: string; phone: string; email: string;
  logoAssetId: string | null;   // permanently null this slice
}
```

**Migration** — `apps/api/prisma/migrations/<ts>_add_organization_profile/migration.sql`,
hand-written in the style of `20260914090000_add_user_manager_capabilities`
(same WARNING block, applied via `prisma migrate deploy`):

```sql
-- CreateTable
CREATE TABLE "OrganizationProfile" (
    "id"          UUID    NOT NULL,
    "name"        TEXT    NOT NULL,
    "legalName"   TEXT    NOT NULL,
    "taxId"       TEXT    NOT NULL,
    "address"     TEXT    NOT NULL,
    "phone"       TEXT    NOT NULL,
    "email"       TEXT    NOT NULL,
    "logoAssetId" TEXT,                                  -- reserved, ADR-012
    "singleton"   BOOLEAN NOT NULL DEFAULT true,         -- design Decision 1
    CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Prisma-VISIBLE (`singleton Boolean @unique @default(true)`).
-- The name matches Prisma's canonical name exactly so the schema cannot drift.
CREATE UNIQUE INDEX "OrganizationProfile_singleton_key"
  ON "OrganizationProfile"("singleton");

-- Hand-written CHECK: Prisma's DSL cannot express CHECK constraints, so this
-- is INVISIBLE to Prisma's migration diffing (precedent:
-- ElementReviewEntry_observations_not_blank). Together with the index above,
-- a second row is STRUCTURALLY IMPOSSIBLE: `true` collides, `false` is
-- refused. WARNING: do NOT let `prisma migrate dev`/`migrate reset`
-- regenerate this file or diff schema.prisma in a way that could DROP this
-- constraint, or any pre-existing hand-written object from earlier
-- migrations. Guarded by the pg_constraint/pg_indexes integration spec.
ALTER TABLE "OrganizationProfile"
  ADD CONSTRAINT "OrganizationProfile_singleton_true" CHECK ("singleton");

-- Seed the one row, BLANK not NULL (proposal, blank-seed semantics): the row
-- is valid to read and incomplete to look at. Hand-picked v7-shaped literal
-- (version nibble 7, variant bits 10, ADR-009) — fixed forever, never
-- regenerated, and deliberately NOT referenced from application code
-- (Decision 1). Bare ON CONFLICT DO NOTHING covers both the PK and the
-- sentinel index, so re-running the migration is a no-op.
INSERT INTO "OrganizationProfile"
  ("id","name","legalName","taxId","address","phone","email","logoAssetId","singleton")
VALUES
  ('01997a00-0000-7000-8000-000000000001'::uuid,'','','','','','',NULL,true)
ON CONFLICT DO NOTHING;
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `OrganizationProfile` model + comment block flagging the Prisma-invisible CHECK. No `deletedAt`, no timestamps |
| `apps/api/prisma/migrations/<ts>_add_organization_profile/migration.sql` | Create | Table + sentinel unique index + hand-written CHECK + idempotent blank seed (above) |
| `.../organization-profile/domain/organization-profile.entity.ts` | Create | Hand-written, zero Prisma, plain fields (Decisions 1–2) |
| `.../organization-profile/domain/errors/organization-profile-missing.error.ts` | Create | Environment defect only — never mapped to an HTTP status (Decision 1) |
| `.../organization-profile/application/ports/organization-profile.repository.port.ts` | Create | `get()` / `update()` + token (above) |
| `.../organization-profile/application/use-cases/get-organization-profile.use-case.ts` | Create | One line, no branch |
| `.../organization-profile/application/use-cases/update-organization-profile.use-case.ts` | Create | One line, no preliminary read (Decision 3) |
| `.../application/use-cases/testing/in-memory-organization-profile.repository.ts` | Create | Holds **one field**, not a `Map` — the fake-side expression of the DB guard; seeded blank in the constructor, mirroring the migration |
| `.../infrastructure/persistence/{prisma-organization-profile.repository,organization-profile.mapper}.ts` | Create | `findUnique`/`update` on `{ singleton: true }`; mapper drops `singleton`. **Not** `extends SoftDeletableRepository` (no `deletedAt`) |
| `.../infrastructure/persistence/organization-profile-migration.integration.spec.ts` | Create | Exactly-one-row + CHECK + index guards (Testing Strategy) |
| `.../presentation/{organization-profile.controller.ts,dto/**}` | Create | `GET`/`PATCH` on `/organization-profile`. **No** error-code file, **no** `buildCodedError` (Decision 4) |
| `.../organization-profile/organization-profile.module.ts` | Create | Controller + 2 use cases + repository binding. **Imports nothing** — no cross-module dependency, no DI cycle risk |
| `apps/api/src/app.module.ts` | Modify | Register the module |
| `apps/api/src/shared/application/authorization/permission.ts` | Modify | `organizationProfile:read\|update` — two, not four |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify | `SYSTEM_ADMIN` row only; the other four stay `[]` |
| `packages/validation/src/organization-profile/update-organization-profile.schema.ts` + `src/index.ts` | Create/Modify | 6 optional fields; local trim-only `taxId`, no-lower-case `email` (Decision 2); no `logoAssetId` key |
| `apps/web/src/api/organization-profile.ts` | Create | `getOrganizationProfile`, `updateOrganizationProfile`. No mirrored error-code union (Decision 4) |
| `apps/web/src/pages/OrganizationProfilePage.tsx` | Create | View + edit in one page; derived incomplete banner; omit-empty payload; no navigate-on-save (Decision 5) |
| `apps/web/src/routes/authenticated-routes.tsx` | Modify | One static route, `allowedRoles: ['SYSTEM_ADMIN']`. No ordering note needed — no sibling dynamic segment |
| `apps/web/src/layout/nav-items.ts` | Modify | `ORGANIZATION_PROFILE` appended **last** on the `SYSTEM_ADMIN` row (a settings surface, not a catalog) |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real `organizationProfile.*` + `nav.organizationProfile` |
| `apps/api/test/organization-profile.e2e-spec.ts` | Create | Auth matrix, GET, PATCH, validation, absent verbs |
| `docs/adr/ADR-012-...md`, `docs/requirements/functional-requirements.md` | Modify | Naming addendum; FR-013 → `partial` |

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit (schema) | Each of the 6 fields optional; `''`/whitespace rejected when supplied; `email` format; `taxId` **not** upper-cased; `email` **not** lower-cased; `logoAssetId` in the payload is stripped | `packages/validation` specs, mirroring `update-user.schema.spec.ts` |
| Unit (use case) | `Get` returns the row with no branch; `Update` calls `update()` **exactly once** and never `get()` first (Decision 3); unsupplied fields untouched | In-memory fake |
| Unit (mapper/entity) | `singleton` never reaches the entity; `logoAssetId` round-trips as `null` | Plain specs |
| Integration | After `migrate deploy`: **exactly one row**, all fields `''`, `logoAssetId` null; the CHECK exists in `pg_constraint`; the unique index exists in `pg_indexes`; a second `INSERT` fails **both** with `singleton = true` and with `singleton = false`; pre-existing hand-written objects not dropped | Real Postgres, mirroring `maintenance-company-migration.integration.spec.ts` |
| E2E | `GET` never 404s; PATCH subset semantics; empty/whitespace field → 400; `POST`/`DELETE`/`/organization-profile/:id` → 404 from the router (route absent); 401 unauthenticated; 403 for all four other roles; `ROLE_PERMISSIONS` non-admin rows still `[]`; `ManagerCapability` still one member | `apps/api/test/organization-profile.e2e-spec.ts` |
| Component | Blank profile renders the incomplete banner; the banner does **not** clear while typing, only after a successful save; partial fill sends only non-empty fields | Vitest + Testing Library, per the `*Page.test.tsx` precedent |
| Browser | Every UI success criterion, per CLAUDE.md | `npm run dev` + `claude-in-chrome`; explicitly the blank→filled→reload round trip and the non-admin `NotAuthorized` surface |

## Migration / Rollout

One additive migration: a new table with its own guard constraints and its own
seed row. Nothing else references it — no FK in either direction, no
`deletedAt`, and no existing code reads it. Rollback = revert the branch and
drop the table; current behaviour is restored verbatim, and the only loss is
corporate data nothing consumes yet.

If the chain is split across PRs, the migration PR is the only one carrying
schema state and must land first; the permission/route/nav/i18n additions are
purely additive and revert independently.

## Findings reported to the proposal

1. **`buildCodedError` is not needed in this slice.** The proposal lists it in
   Presentation scope, but no status in this module has more than one
   reachable cause, so the repo's own coded-error convention says no code is
   earned (Decision 4). No error-code union, no web mirror, no
   `error-messages.ts` module — less surface than the proposal budgeted.
2. **The schema carries one column ADR-012 does not list** — `singleton`, a
   persistence-only guard with no domain meaning, never mapped onto the
   entity or any DTO (Decision 1). The *domain* field set is still exactly
   ADR-012's list.
3. **Non-empty-on-write makes the blank seed one-way.** Once a field is
   filled it can be changed but never emptied, through the API or the UI
   (Decision 5). Handed to `sdd-spec` — if that is unacceptable, the fix is a
   deliberate clear semantic (explicit `null`), which is Open Question 4's
   territory, not a design change.

## Open Questions

- [ ] Confirm at apply time that `prisma migrate dev` does not emit a
      `DROP CONSTRAINT` for the hand-written CHECK, or drop any pre-existing
      Prisma-invisible object; the `pg_constraint` integration test is the
      guard either way (the same standing item every slice since `community`
      has carried).
- [ ] `sdd-spec` owns whether `logoAssetId` appears in the response DTO (Open
      Question 5). Either answer is a DTO-only delta: the column, the entity
      field and the mapper are unaffected, and the field is unwritable in both
      cases.
- [ ] `sdd-spec` owns the no-op PATCH status (Open Question 4). Decision 3's
      mechanics make 200 the free outcome; a 400 costs one guard and no
      repository change.
