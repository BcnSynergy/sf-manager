# Tasks: Organization Profile (FR-013 / ADR-012)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1300-1500 (1 migration+integration spec, 1 module across 4 layers with no create/delete surface, 2-permission authz delta, 1 shared Zod schema, 1 combined web page + i18n x3, full e2e coverage) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR6 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|---|---|---|---|---|
| 1 | Migration + domain: `OrganizationProfile` table (sentinel unique + CHECK, blank seed), hand-written entity + missing-row error, migration integration spec | PR 1 | ~260 | Foundation; nothing downstream compiles without the entity/schema shape |
| 2 | Application + authorization: port, 2 use cases, in-memory fake, unit specs; `Permission` union + `SYSTEM_ADMIN`-only grant | PR 2 | ~220 | Depends on PR 1 (entity types); authz half is independent, bundled for size |
| 3 | Infrastructure + presentation + shared schema: Prisma adapter/mapper, controller+DTOs, module wiring, `app.module.ts`, `packages/validation` PATCH schema | PR 3 | ~300 | Depends on PR 1, PR 2 |
| 4 | E2E: `organization-profile.e2e-spec.ts` — auth matrix, GET/PATCH, absent verbs | PR 4 | ~160 | Depends on PR 3 |
| 5 | Web core: api client, `OrganizationProfilePage`, route, component tests | PR 5 | ~360 | Depends on PR 3 (contract stable) |
| 6 | Web polish + docs: i18n (en/es/ca), nav item, ADR-012 naming addendum, FR-013 status, browser verification | PR 6 | ~180 | Depends on PR 5 |

## Phase 1: Migration + Domain (PR 1)
- [x] 1.1 `apps/api/prisma/schema.prisma`: add `OrganizationProfile` model — `id`, 6 text fields, `logoAssetId String?`, `singleton Boolean @unique @default(true)`; comment block flagging the hand-written CHECK. No `deletedAt`, no timestamps.
- [x] 1.2 Hand-written migration SQL `apps/api/prisma/migrations/<ts>_add_organization_profile/migration.sql`: `CREATE TABLE`, `OrganizationProfile_singleton_key` unique index, `OrganizationProfile_singleton_true` CHECK, idempotent blank-seed `INSERT ... ON CONFLICT DO NOTHING` with the literal UUIDv7 (design.md).
- [x] 1.3 RED/GREEN `organization-profile.entity.ts` / `.spec.ts` — plain fields, zero Prisma (ADR-013), no constructor validation, no `singleton` field.
- [x] 1.4 `domain/errors/organization-profile-missing.error.ts` — never mapped to an HTTP status (design Decision 1).
- [ ] 1.5 RED/GREEN `organization-profile-migration.integration.spec.ts` (real Postgres): exactly one row after `migrate deploy`, all fields `''`, `logoAssetId` null; CHECK present in `pg_constraint`; unique index present in `pg_indexes`; a second `INSERT` fails with `singleton = true` and with `singleton = false`; pre-existing hand-written objects from earlier migrations not dropped. **Written, not execution-verified** — see Blockers below.
- [ ] 1.6 Verify `prisma migrate dev` does not emit a `DROP CONSTRAINT`/`DROP INDEX` for this migration's hand-written objects or any pre-existing one (standing check since `community`); fix the generated migration file if it does. **Blocked** — see Blockers below.

### Blockers (PR 1)
- No Postgres instance was reachable in the apply sandbox (`docker-compose.yml`'s `postgres` service requires Docker Desktop, whose service is stopped and cannot be started without elevation; port 5432 is not listening). `npm run test:integration --workspace=apps/api` fails with connection errors across ALL 18 pre-existing integration spec files, not just the new one — this is a sandbox-wide limitation, not a regression from this change.
- Task 1.5's spec (`organization-profile-migration.integration.spec.ts`) is written, mirrors the `maintenance-company`/`review-session` precedent, type-checks, and lints clean, but has never been run against a real database. It must be executed against `docker-compose up postgres` + `prisma migrate deploy` before this PR is considered verified.
- Task 1.6 (`prisma migrate dev --create-only` drift check) requires the same live database and has not been performed.

## Phase 2: Application + Authorization (PR 2)
- [ ] 2.1 `application/ports/organization-profile.repository.port.ts` — `get(): Promise<OrganizationProfile>` (not `| null`), `update(changes): Promise<OrganizationProfile>`, `ORGANIZATION_PROFILE_REPOSITORY` token, `OrganizationProfileChanges` type (no `logoAssetId` key).
- [ ] 2.2 RED/GREEN `get-organization-profile.use-case.ts` — one line, no branch, no read-before-check.
- [ ] 2.3 RED/GREEN `update-organization-profile.use-case.ts` — calls `repo.update(changes)` exactly once, never `repo.get()` first (design Decision 3).
- [ ] 2.4 `application/use-cases/testing/in-memory-organization-profile.repository.ts` — holds one field, not a `Map`; seeded blank in the constructor.
- [ ] 2.5 `shared/application/authorization/permission.ts` — add `organizationProfile:read`, `organizationProfile:update` (two, not four).
- [ ] 2.6 RED/GREEN `role-permission.checker.ts` spec extension — `SYSTEM_ADMIN` gets both; the other 4 roles stay `[]` (extend the existing exhaustive table-driven spec).

## Phase 3: Infrastructure + Presentation + Shared Schema (PR 3)
- [ ] 3.1 RED/GREEN `organization-profile.mapper.ts` — `singleton` never reaches the entity; `logoAssetId` round-trips as `null`.
- [ ] 3.2 `prisma-organization-profile.repository.ts` — `findUnique`/`update` addressed by `{ singleton: true }`; throws `OrganizationProfileMissingError` on a null read. Not `extends SoftDeletableRepository`.
- [ ] 3.3 `packages/validation/src/organization-profile/update-organization-profile.schema.ts` + `src/index.ts` export: 6 optional fields, each `.trim().min(1)`; `email` also piped through a format check; local `taxId` schema (trim-only, **not** upper-cased — do not import `taxIdSchema` from `maintenance-company`); no `logoAssetId` key so unknown keys are stripped.
- [ ] 3.4 Unit specs for the schema (mirroring `update-user.schema.spec.ts`): each field optional; `''`/whitespace rejected when supplied; explicit `null` rejected; email format enforced; `taxId` not upper-cased; `email` not lower-cased; `logoAssetId` in the payload stripped.
- [ ] 3.5 `presentation/organization-profile.controller.ts` + `dto/**` (response DTO omits `logoAssetId`) + Swagger — `GET`/`PATCH /organization-profile` only, guarded by `AuthenticatedGuard` + `PermissionsGuard` + `@RequirePermission('organizationProfile:read'|'organizationProfile:update')`. No error-code file, no `buildCodedError` (design Decision 4 — zero statuses with >1 reachable cause).
- [ ] 3.6 `organization-profile.module.ts` — controller + 2 use cases + repository binding; imports nothing from other modules.
- [ ] 3.7 `apps/api/src/app.module.ts` — register the module.

## Phase 4: E2E (PR 4)
- [ ] 4.1 `apps/api/test/organization-profile.e2e-spec.ts`: `GET` never 404s across lifecycle states; blank-seed read returns all-empty strings; no `complete`/`incomplete` flag in the response; no `logoAssetId` key in any response.
- [ ] 4.2 E2E: `PATCH` subset semantics (untouched fields unchanged); trimmed storage; empty body / identical values / unrecognized properties all succeed 200 unchanged.
- [ ] 4.3 E2E: empty/whitespace/explicit-`null` supplied field -> 400, nothing changed, including the sibling valid field in the same request.
- [ ] 4.4 E2E: `POST`/`DELETE /organization-profile` and `/organization-profile/:id` do not resolve to a profile operation; supplying `logoAssetId` in a PATCH writes nothing.
- [ ] 4.5 E2E: 401 unauthenticated on both routes; 403 for each of the 4 non-admin roles on both routes; `ROLE_PERMISSIONS` non-admin rows still `[]`; `ManagerCapability` still declares only `VIEW_ALL_REVIEWS`.

## Phase 5: Web Core (PR 5)
- [ ] 5.1 `apps/web/src/api/organization-profile.ts` — `getOrganizationProfile`, `updateOrganizationProfile`, typed on the shared schema/DTO shape. No mirrored error-code union (design Decision 4).
- [ ] 5.2 `apps/web/src/pages/OrganizationProfilePage.tsx` — `loading`/`loaded`/`error` states; six fields prefilled and editable in one page; derived `incomplete` banner computed from the last-saved snapshot, not live inputs, `data-testid="organization-profile-incomplete"` distinct from `-loading`/`-error-state`; payload built from trimmed non-empty values only; no `navigate()` after save.
- [ ] 5.3 `apps/web/src/routes/authenticated-routes.tsx` — one static route, `allowedRoles: ['SYSTEM_ADMIN']`.
- [ ] 5.4 Component tests (`OrganizationProfilePage.test.tsx`, Vitest + Testing Library): blank profile shows the incomplete banner; banner stays while typing and clears only after a successful save; partial fill sends only non-empty fields; save failure keeps entered values and shows an error; non-admin route access renders `NotAuthorized`, not a redirect.

## Phase 6: Web Polish + Docs (PR 6)
- [ ] 6.1 `apps/web/src/layout/nav-items.ts` — `ORGANIZATION_PROFILE` appended last on the `SYSTEM_ADMIN` row; extend `nav-items.reachability.test.ts` for the new item (unrelaxed).
- [ ] 6.2 `apps/web/src/i18n/locales/{en,es,ca}.json` — real `organizationProfile.*` + `nav.organizationProfile` translations (no placeholders); extend `locales.test.ts` parity guard for the new namespace.
- [ ] 6.3 `docs/adr/ADR-012-...md` — naming addendum recording `OrganizationProfile` as the implementation name, with the rationale from proposal.md.
- [ ] 6.4 `docs/requirements/functional-requirements.md` — FR-013 status -> `partial`.
- [ ] 6.5 Browser verification (`npm run dev`, `claude-in-chrome`, `SYSTEM_ADMIN` session, CLAUDE.md): blank-seed not-completed state visible; fill all six fields, save, reload, values persist and banner clears; non-admin URL access shows `NotAuthorized`; es/ca locale spot-check for the new strings.
- [ ] 6.6 Full API + web suites, lint, build all pass; `no-restricted-imports` clean; `grep -r PropertyManagementCompany apps/` returns nothing; grep confirms no object-storage client/service/dependency and no `MANAGE_ORGANIZATION_PROFILE` string anywhere in `apps/**`/`packages/**`.

## Rules Applied
- Strict TDD: RED/GREEN on all logic-bearing files (entity, use cases, mapper, migration integration spec, authorization spec, shared Zod schema, component tests). Migration SQL, DTOs, module wiring, route registration, i18n JSON and docs are mechanical — no RED/GREEN required.
- Design Decisions 1-5 (sentinel-column singleton guard, plain-string fields with no VOs, no-preliminary-read update, no `buildCodedError`, UI-only incompleteness signal derived from saved snapshot) are settled — do not re-litigate at apply time.
- `logoAssetId` never appears in any request/response DTO or Zod schema key — unwritable by construction, not by a rejection rule (design.md Interfaces/Contracts).
- Do not import `taxIdSchema` from `maintenance-company` — declare a local trim-only schema (design Decision 2).
