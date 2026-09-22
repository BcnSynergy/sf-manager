# Archive Report: organization-profile

FR-013's first and only slice: the property management company's own corporate data (ADR-012), modelled as a **singleton** `OrganizationProfile` row — `name`, `legalName`, `taxId`, `address`, `phone`, `email`, plus a reserved, inert `logoAssetId`. A `SYSTEM_ADMIN` reads and edits it on one combined view/edit page; no create, no delete, no list. This closes the `SYSTEM_ADMIN` half of FR-013; the `MANAGER` route stays deferred to its own slice, exactly like FR-008's per-role rollout.

## Chain shipped (6 implementation PRs + 1 remediation PR, all merged to `main`)

| PR | Title | Commit / PR # | Content |
|---|---|---|---|
| 1/6 | Migration + domain | #134 | `OrganizationProfile` Prisma model, sentinel-unique + CHECK singleton guard, hand-written idempotent blank-seed migration, domain entity, `OrganizationProfileMissingError`, migration integration spec |
| 2/6 | Application + authorization | #135 | Repository port, 2 use cases (`get`, `update`), in-memory fake, `organizationProfile:read`/`update` permissions on `SYSTEM_ADMIN` only |
| 3/6 | Infrastructure + presentation + shared schema | #136 | Prisma adapter/mapper, `GET`/`PATCH` controller + DTOs (no `logoAssetId`), `packages/validation` Zod schema, module wiring |
| 4/6 | E2E | #137 | Full HTTP-contract e2e: auth matrix, PATCH subset/trim/reject semantics, no create/delete/`:id` surface, `logoAssetId` inert |
| 5/6 | Web core | #138 | `OrganizationProfilePage` (loading/loaded/error), api client, route gated `SYSTEM_ADMIN`, component tests |
| 6/6 | Web polish + docs | #139 | Nav item, en/es/ca i18n, ADR-012 naming addendum, FR-013 status -> `partial`, browser verification |
| Remediation | Post-verify fixes | #140 (`4db74d8`) | Hermetic migration-spec fix (CRITICAL-1), stale 6.5 checkbox corrected, 4.5 phantom-assertion claim corrected, Decision 5 success indication implemented, second fresh-context review pass fixes |

Verified against `main` @ `96cbdab` (pre-remediation) and again after `4db74d8` (remediation merged). Working tree clean at archive time.

## Task completion

28/28 task items checked across `tasks.md` (Phase 1: 6, Phase 2: 6, Phase 3: 7, Phase 4: 5, Phase 5: 4, Phase 6: 6 including the corrected 6.5, Remediation: 5). No stale unchecked implementation tasks — Task Completion Gate passes.

## Verification verdict and remediation closure

**Original `sdd-verify` verdict (2026-09-22, pre-remediation): PASS WITH WARNINGS — do NOT archive until CRITICAL-1 and WARNING-1 closed.**

- 58 spec scenarios: 51 COMPLIANT, 6 PARTIAL, 1 FAILING, 1 UNTESTED
- Test execution: API unit 939 pass, web 873 pass, API e2e 374 pass, migration-integration 45/47 (2 failed), lint/build clean
- Assertion Quality Audit: CLEAN (zero tautologies, ghost loops, smoke-only tests)
- CRITICAL-1: `organization-profile-migration.integration.spec.ts` non-hermetic seed-state assertion (read shared mutable dev DB, PR6's own browser verification legitimately mutated it) — not a production bug, a test-isolation defect, with a pre-existing twin in `inspectable-element-migration.integration.spec.ts`
- WARNING-1..4: stale `tasks.md` 6.5 checkbox; `tasks.md` 4.5 mis-described where two assertions actually live; Design Decision 5's success indication unimplemented; an Engram `apply-progress` topic_key upsert collapsed TDD Cycle Evidence history

**Remediation (PR #140, merged as `4db74d8`) closed both archive-gating findings and the two documentation warnings:**

- R.1 closed CRITICAL-1 — the migration spec now asserts read-only, permanent invariants (DDL `DEFAULT ''`, the seeded row's fixed id/`singleton`/`logoAssetId`) instead of live row contents that a legitimate browser save can mutate. Accepted trade-off recorded in-file: no longer catches a broken seed INSERT that bypassed the DEFAULT with a non-blank literal (shared long-lived dev Postgres, no per-test isolation — same shape as the `maintenance-company`/`review-session` precedents).
- R.2 closed WARNING-1 (6.5 checkbox corrected with the physical corroboration already on record — the `Sunny Fields PM` row the session's own browser save wrote).
- R.3 closed WARNING-2 (4.5's claim corrected to point at the real coverage: `role-permission.checker.spec.ts` for `ROLE_PERMISSIONS`, `user-manager-capability-migration.integration.spec.ts` for the `ManagerCapability` single-member Postgres enum check).
- R.4 closed WARNING-3 (Design Decision 5's success indication implemented: `data-testid="organization-profile-success"`, 3 new component tests; golden path browser-verified, the partial-fill-plus-success-together scenario is jsdom-only — documented explicitly per this repo's CLAUDE.md rule).
- R.5 is a second fresh-context review pass on R.1-R.4, fixing a hardcoded ID duplication and collapsing two sequential Prisma queries into one; also traced but deliberately left out of scope (ADR-006 discipline: this slice is `organization-profile` only) the `inspectable-element-migration.integration.spec.ts` sibling carrying the same non-hermetic pattern R.1 fixed here — tracked at Engram `discovery/non-hermetic-migration-integration-specs` (id 299) as a recorded follow-up, not a blocking issue.
- WARNING-4 (Engram `apply-progress` topic_key upsert history loss) is a process observation about the `engram`-only mode risk, not a code defect; no code remediation applies. Recorded here as the argument for this project's `hybrid` artifact-store choice, already in effect.

All 5 findings that were open before remediation are now closed. Archiving now, per the verify report's own "Next" section: *"Then re-verify -> `sdd-archive`"*.

### Remaining SUGGESTIONs carried forward (non-blocking, no CRITICAL/WARNING among them)

1. No test for "partially filled profile still shows not-completed" (only blank and full states are directly tested).
2. Blank-field error is form-level, not field-scoped as the spec's wording suggests.
3. Page tests assert only `data-testid`, never rendered translated text.
4. "Nav issues no request for the profile" scenario has no dedicated covering test.
5. "No logo affordance" / "no create-delete-list affordance" rest on static evidence only.
6. `organization-profile.e2e-spec.ts` is an HTTP-contract test with an in-memory repo and stubbed `PrismaService`, not full-stack e2e — repo precedent, honestly documented in-file.

## What was deliberately deferred (explicit proposal-time scope cuts, not bugs)

- **MANAGER route / `MANAGE_ORGANIZATION_PROFILE`.** ADR-011 Decision 2 names this capability but leaves it undeclared; this slice is `SYSTEM_ADMIN`-only by design, mirroring how FR-008 rolled out one role at a time. `grep MANAGE_ORGANIZATION_PROFILE apps/ packages/` returns 0 hits, verified by both `sdd-verify` and remediation.
- **Logo upload / object storage.** `logoAssetId` exists on the schema and domain entity as a reserved, nullable, permanently-`null` column — absent from every API response and request body by construction (Zod strips unknown keys). No object-storage service, client or credential exists anywhere in the tree.
- **Per-user locale preference.** Out of scope for this slice entirely; not named in the proposal, spec, or design — the UI uses the existing app-wide en/es/ca i18n mechanism unchanged.
- **No audit trail, no completeness gate on any other surface, no taxId format validation, no uniqueness constraint.** All explicit Out-of-Scope items from the proposal, held throughout spec, design and implementation.

## Naming decision: `OrganizationProfile` vs. ADR-012's `PropertyManagementCompany`

Resolved at proposal time and already merged into `docs/adr/ADR-012-...md` as a naming addendum in PR6 (#139). One name — `OrganizationProfile` — used everywhere in code (Prisma model, domain entity, module, route, permissions, page, i18n namespace), diverging deliberately from ADR-012's literal text (`PropertyManagementCompany`). Rationale recorded in the addendum and in the proposal: (1) `MANAGE_ORGANIZATION_PROFILE` has already been the project's vocabulary in ADR-011 for months; (2) `/property-management-company` next to `/maintenance-companies` in the same admin nav would be a real UX hazard — two "company" sections, one of which is not a managed catalog; (3) this is a settings-about-ourselves screen, not a managed catalog entity. ADR-012's actual decision (entity existence, singleton, field list, no `deletedAt`) is untouched — only the name differs from the ADR's literal text, and the addendum makes that explicit so ADR and code do not silently drift. `grep PropertyManagementCompany apps/` returns 0 hits, verified by `sdd-verify`.

## Design coherence

All 5 design decisions verified as implemented exactly as written:

1. DB-level singleton guard (sentinel `singleton BOOLEAN @unique` + hand-written `CHECK`), not `findFirst()` and not a literal-UUID `findUnique` — a second row is structurally impossible.
2. All six fields plain trimmed strings, no Value Objects — `taxId` trimmed only (not upper-cased, no unique index to canonicalize for), `email` trimmed + format-checked but not lower-cased (no uniqueness to protect).
3. `UpdateOrganizationProfileUseCase` does not read before it writes — one atomic `update()`, empty-body PATCH naturally 200.
4. No error-code union, no `buildCodedError` — no status in this module has more than one reachable cause.
5. Incompleteness signal derived from the saved snapshot, not form state and not the server — three load states plus a derived banner; the success-indication half of this decision was the one implementation gap `sdd-verify` caught (WARNING-3), closed by remediation R.4.

## Source of truth updated (delta specs merged into main specs)

- `openspec/specs/organization-profile-management/spec.md` (**new** — 8 requirements, singleton existence, read/update contract, non-blank-on-write rule, no create/delete surface, `logoAssetId` inertness, no downstream consumer)
- `openspec/specs/organization-profile-admin-ui/spec.md` (**new** — 8 requirements, role gating, combined view/edit page, not-completed-yet state, save flow, no logo control, i18n)
- `openspec/specs/app-navigation/spec.md` (**delta merged** — `SYSTEM_ADMIN` row widened from 7 to 8 items with "Organization profile" as the eighth; every item's target reframed from "top-level list route" to "top-level route" to admit a singleton page with no list; new *The Added Item Preserves the Reachability Invariant* requirement)
- `openspec/specs/authorization/spec.md` (**delta merged** — two new requirements, *Permission Check on Organization Profile Endpoints* and *The Organization Profile Grants Nothing Beyond Itself*, adding `organizationProfile:read`/`organizationProfile:update` to the `Permission` union, `SYSTEM_ADMIN`-only, confirming the four non-admin rows and the `ManagerCapability` single-member invariant are unchanged)
- `docs/adr/ADR-012-...md` (naming addendum, already merged in PR6/#139, confirmed present)
- `docs/requirements/functional-requirements.md` (FR-013 status -> `partial`, already merged in PR6/#139, confirmed present)

## SDD Cycle Complete

This change has been fully planned (`sdd-propose`/`sdd-spec`/`sdd-design`), broken into tasks, implemented across 6 stacked PRs, verified (PASS WITH WARNINGS), remediated (1 more PR closing the CRITICAL and both archive-relevant WARNINGs), re-confirmed closed, and is now archived. FR-013's `SYSTEM_ADMIN` half is closed; the `MANAGER` route remains deferred to its own future slice.

## Traceability

This change was run under artifact store mode **hybrid**. Engram topic keys for this change's full artifact trail:

- `sdd/organization-profile/proposal` (obs #291)
- `sdd/organization-profile/spec` (delta spec files, read directly from disk for this report)
- `sdd/organization-profile/design` (obs #293)
- `sdd/organization-profile/tasks` (tasks.md, read directly from disk for this report)
- `sdd/organization-profile/apply-progress` (obs #295)
- `sdd/organization-profile/verify-report` (obs #298)
- `sdd/organization-profile/archive-report` (this report)

Filesystem artifacts (pre-move, inside the not-yet-archived change folder): `proposal.md`, `design.md`, `tasks.md`, `verify-report.md`, `archive-report.md`, `specs/app-navigation/spec.md`, `specs/authorization/spec.md`, `specs/organization-profile-management/spec.md`, `specs/organization-profile-admin-ui/spec.md` — all under `openspec/changes/organization-profile/`.

## Orchestrator action required (this sub-agent has no Bash access)

The orchestrator must now:

1. `git mv openspec/changes/organization-profile openspec/changes/archive/2026-09-22-organization-profile`
2. Stage and commit: the folder move, this `archive-report.md`, and the four merged/created main-spec files (`openspec/specs/app-navigation/spec.md`, `openspec/specs/authorization/spec.md`, `openspec/specs/organization-profile-management/spec.md` [new], `openspec/specs/organization-profile-admin-ui/spec.md` [new]).

Target archive folder name, following this repo's `<date>-<change-name>` convention:

**`openspec/changes/archive/2026-09-22-organization-profile/`**
