# Exploration: dev-seed-data

## Current State

- `apps/api/prisma/seed.ts` boots a real Nest app context (`NestFactory.createApplicationContext(AppModule)`), resolves `ID_GENERATOR`, `PASSWORD_HASHER` (argon2id) and `USER_REPOSITORY`, and upserts by email via `UserRepository.save()` (id preserved, so idempotent). It is invoked by `prisma.config.ts` (`seed: 'ts-node prisma/seed.ts'`) through `prisma db seed`, and automatically after `migrate reset`.
- Admin: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from env. Technician `technician@sf-manager.example` with hardcoded password `nav-menu-verify-12345`, gated by `shouldSeedDevAccount(NODE_ENV)` = `!isProduction` (`apps/api/src/shared/seeding/should-seed-dev-account.ts`, has a spec). The gate is "not production", not "is development": staging or any other `NODE_ENV` would seed public credentials.
- The only reference to `dev-seed-data` in docs is `CLAUDE.md` ("until `dev-seed-data` (not yet implemented) recreates them"). The README documents the reset procedure and states the DB holds only admin + technician + org profile row. No ADR open question or FR entry.
- Integration tests use a hermetic per-run DB (`apps/api/src/shared/testing`); no test runs the seed. The seed has no test-suite coupling, but `seed.ts` itself is untested.

## Schema

Prisma is infrastructure-only (ADR-013); cross-module FKs and partial unique indexes are hand-written in `migration.sql`.

- **User**: email unique, `role`, `maintenanceCompanyId?`, `managerCapabilities[]`, `deletedAt`. Roles: `SYSTEM_ADMIN`, `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`. Domain invariant `assertCompanyMatchesRole`: company id required for the two maintenance roles, forbidden otherwise (`save()` bypasses it; the use case enforces it). `MANAGER` sees all reviews only with `VIEW_ALL_REVIEWS`, granted only via `UpdateUser`, not on create.
- **MaintenanceCompany**: `name`, `taxId` (upper-cased), `contactInfo`, `deletedAt`; partial unique on `taxId WHERE deletedAt IS NULL`.
- **Community**: `name`, `address`, `locale` (en|es|ca), `deletedAt`. `CommunityRepresentative` / `CommunityTechnician` with `deactivatedAt`; one active representative per community (partial unique index is the only DB backstop).
- **InspectableElement**: `elementType` = `EXTINGUISHER` only, `name`, `location`, `installedAt` (DATE), `code` VARCHAR(10) unique, app-generated with retry.
- **ChecklistQuestion**: `elementType`, `frequencies[]`, `text`, `deletedAt`.
- **ReviewTemplate**: `version` NULL until activation, `status` draft|active|retired, `draftQuestionIds[]` (draft only); three partial unique indexes (one active per lineage, one draft per lineage, lineage-version). `ReviewTemplateQuestion` snapshot rows exist only for activated/retired versions. Activation assigns `version = COALESCE(MAX,0)+1` in a transaction and snapshots questions.
- **ReviewSession**: `templateId` = frozen version row, `performedByCompanyId` snapshotted at open time; one open draft per (community, template, performer). `ElementReviewEntry` (observations non-null iff unreviewed, CHECK not blank) + `QuestionAnswer` (YES|NO|NOT_APPLICABLE). Completed sessions are immutable.
- **OrganizationProfile**: singleton row created by migration with blank fields, edited via `UpdateOrganizationProfileUseCase`; review-export presumably wants it filled.

## Role Visibility (`apps/web/src/layout/nav-items.ts`)

| Role | Nav |
|---|---|
| SYSTEM_ADMIN | Home, Users, Communities, Maintenance companies, Checklist questions, Review templates, Review history, Organization profile |
| MANAGER | Home, Review history |
| MAINTENANCE_COMPANY_MANAGER | Home, Review history |
| MAINTENANCE_TECHNICIAN | Home, Review sessions, Review history |
| COMMUNITY_REPRESENTATIVE | Home, Review sessions, Review history |

Review history scope differs per role (own / company / assigned communities / all with capability / admin installation-wide). Making each scope browser-checkable needs completed sessions by at least 2 companies and 2 communities, with representatives and technicians assigned asymmetrically.

## Available Use Cases

`CreateUser`, `UpdateUser`, `CreateMaintenanceCompany`, `CreateCommunity`, `AddRepresentative`, `AddTechnician`, `CreateInspectableElement`, `CreateChecklistQuestion`, `CreateDraftReviewTemplate`, `SetReviewTemplateQuestions`, `ActivateReviewTemplate`, `OpenReviewSession`, `RecordEntry`, `CompleteReviewSession`, `UpdateOrganizationProfile`.

None are idempotent: `CreateUser` rejects duplicate email, `CreateDraftReviewTemplate` rejects a second draft per lineage, activation always bumps version, `OpenReviewSession` rejects a second open draft. Use cases stamp timestamps with "now" (no backdating).

## Approaches

| # | Approach | Pros | Cons | Effort |
|---|---|---|---|---|
| 1 | Extend `seed.ts` with raw Prisma upserts and fixed UUIDs | Idempotent by construction; can backdate history | Prisma outside infrastructure (ADR-013 spirit); bypasses domain invariants, can seed states the app can never produce | Medium |
| 2 | Separate dev-only dataset module going through use cases/repositories, invoked after the admin bootstrap | Invariants honored; separates prod-safe bootstrap from public-credential data; consistent with current seed | Needs natural-key skip-if-exists guards; timestamps all "now"; needs an Actor for record/complete | Medium-High |
| 3 | Extend `seed.ts` in place with use cases behind `shouldSeedDevAccount` | One command; `migrate reset` auto-populates | Public credentials stay in the prod-capable file; gate stays `!production`; `seed.ts` grows | Medium |

## Recommendation

Approach 2, run as a second phase of `prisma db seed` after the admin bootstrap so `migrate reset` yields a QA-ready DB:

- Go through use cases/repositories so the dataset is always valid.
- Idempotent via natural-key skip-if-exists (email, taxId, community name).
- Fixed, documented dev credentials.
- Gate on an explicit allow-list (`NODE_ENV === 'development'` or a `DEV_SEED` flag), not `!production`.
- Specs for the gate and idempotency (run twice, counts stable), per Strict TDD. An integration test running the dev seed against the hermetic per-run DB would catch drift.
- No web UI: deliberate, pure dev tooling (per the `CLAUDE.md` API-only check — state it in the proposal).

### Minimal slice (ADR-006)

2 maintenance companies; users for all 5 roles; 2 communities with asymmetric assignments; 1–2 extinguishers per community; ~3–5 questions; 1 active template (EXTINGUISHER × MONTHLY); filled org profile; a few completed sessions + 1 draft.

### Scope creep to flag

Multiple templates/frequencies/versions, retired templates, soft-deleted/deactivated fixtures, high-volume/perf data, faker-style randomness, backdated history beyond what the spec needs, seeding other environments, CLI profiles, a wipe-and-reseed command.

## Risks

- Public credentials seeded into a non-dev DB (current gate is `!production`).
- Non-idempotent use cases cause duplicates or failures on rerun; a mid-seed failure leaves partial data (no transaction spans use cases).
- `PlainPassword` strength policy may reject a weak dev password (today's technician password goes straight to the hasher).
- Raw Prisma could violate index-backed invariants or the frozen-template contract.
- Use-case timestamps are all "now", so history filters get no date variety.
- `seed.ts` is untested; drift as the schema evolves.
- README reset paragraph and `CLAUDE.md` dev-data bullet must be updated in the same change.

## Open Product Questions

1. One fixed shared dev password for all seeded users, or env-driven per role? Reuse the former `rep@` / `companymgr@` / `manager@sf-manager.example` emails?
2. Should `prisma db seed` always include the dev dataset outside production, or only on explicit opt-in (`DEV_SEED` flag / separate npm script)?
3. Is one completed session per scope enough, or do review-export/history filters need several across dates (requires backdating)?
4. A `MANAGER` with `VIEW_ALL_REVIEWS` and one without? Two maintenance companies?
5. Should the seed fill the migration-owned org profile row?
6. Only an additive idempotent seed, or also a wipe-and-reseed command?

## Ready for Proposal

Yes — run a product question round first.
