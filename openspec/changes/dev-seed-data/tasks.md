# Tasks: Dev Seed Data

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1030 total: PR1 ~400 (170 code / 230 test), PR2 ~300 (150/150), PR3 ~300 (120/180) |
| 400-line budget risk | Medium (PR1 at the limit; excess is test fixtures) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 -> PR 2 -> PR 3 (design split validated) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Gate, host log, runDevSeed, companies, users, `.env.example`, README env/accounts | PR 1 | Base main. Branch `dev-seed-data/01-gate-companies-users`. Also commits the untracked `openspec/changes/dev-seed-data/`. Acceptance: user runs `prisma migrate reset` then `prisma db seed` (needs `NODE_ENV=development` in local `apps/api/.env`, set by the user). |
| 2 | Profile, communities, assignments, elements, questions, template | PR 2 | Base main after PR 1. Branch `dev-seed-data/02-catalog`. |
| 3 | Sessions, guard, scope assertions, README reset, CLAUDE.md | PR 3 | Base main after PR 2. Branch `dev-seed-data/03-sessions-docs`. |

Each PR: fresh-context review before push and merge. Integration specs must not assume lineage state (leftover EXTINGUISHER x MONTHLY templates); use `buildDataset(suffix)`.

## PR 1

- [x] 1.1 RED: `apps/api/src/shared/seeding/should-seed-dev-data.spec.ts` (rename of the account spec). Only `'development'` is true; `undefined`, `test`, `staging`, `production`, `''`, `Development` are false.
- [x] 1.2 GREEN: rename to `should-seed-dev-data.ts`, exact-match allow-list. REFACTOR: drop `isProduction` use.
- [x] 1.3 RED then GREEN: `describe-database-host{.spec,}.ts`. Host and port only, no `user:pass@`, `'unknown'` on unset or malformed.
- [x] 1.4 RED: `dev-dataset.spec.ts`. `DEV_SEED_PASSWORD` accepted by `passwordSchema`; companies and users parse unchanged through `createMaintenanceCompanySchema` / `createUserSchema`.
- [x] 1.5 GREEN: `dev-dataset.ts` with the password, 2 companies and 6 users (the design's Dataset table).
- [x] 1.6 RED then GREEN: `dev-seed-plan{.spec,}.ts` with `findByNaturalKey` and `describeUserDrift`.
- [x] 1.7 RED: `seed-dev-dataset.spec.ts` with fake deps. Skip if exists, blocked user on drift, `EmailAlreadyInUseError` warns and blocks, `VIEW_ALL_REVIEWS` grant by check. `runDevSeed`: closed gate calls no use case and logs the skip line with the host; open gate logs the start line with the host.
- [x] 1.8 GREEN: `seed-dev-dataset.ts` with `resolveDevSeedDeps`, `seedDevDataset` (companies, users, grant) and `runDevSeed`.
- [x] 1.9 Wire `apps/api/prisma/seed.ts`: remove the technician block, call `runDevSeed`. Add `src/shared/seeding` to `apps/api/tsconfig.build.json` exclude.
- [x] 1.10 Create tracked `apps/api/.env.example` (`NODE_ENV=development` plus existing keys with placeholders). Do NOT read or write `apps/api/.env`.
- [x] 1.11 RED then GREEN: static-file spec. `.env.example` has `NODE_ENV=development`; README has each account email and the password. Then update README (env setup, accounts, password).
- [x] 1.12 RED then GREEN: `seed-dev-dataset.integration.spec.ts` (AppModule, 60 s timeout, `buildDataset`). Run twice: counts by seeded key are equal. Drift and soft-deleted email cases.
- [x] 1.13 REFACTOR, run `npm test` and `npm run test:integration`. Manual: user does reset then seed (acceptance).

## PR 2

- [ ] 2.1 RED: extend dataset spec. Communities, elements, questions and profile literals are canonical through the shared schemas.
- [ ] 2.2 RED: `planTemplate` unit spec, all 5 kinds (`use-active`, `finish-draft`, `create`, `skip-foreign-draft`, `skip-unusable-active`).
- [ ] 2.3 GREEN: `planTemplate` in `dev-seed-plan.ts`. Dataset gains communities, assignments, elements, questions and profile.
- [ ] 2.4 RED then GREEN: orchestrator steps profile, communities, assignments (blocked users skipped), elements, questions, template. Foreign drafts are untouched.
- [ ] 2.5 Integration: second run has equal counts; the profile is overwritten; assignments and elements match. Template assertions branch on the `planTemplate` kind.
- [ ] 2.6 REFACTOR, run all suites.

## PR 3

- [ ] 3.1 RED: `isExpectedSessionError` (each Decision 12 class true, generic `Error` false) and `planSession` (skip, resume, open, draft-skip, no shared pair, `skip-unusable-active` blocks only `open`).
- [ ] 3.2 GREEN: both in `dev-seed-plan.ts`. Dataset gains S1-S3 and the draft.
- [ ] 3.3 RED: `runSessionGuarded` with fakes. A domain error logs the plan, performer, community and error, and the next session runs. A non-domain error propagates. Resume records only missing planned elements from the session's own template and never overwrites QA edits.
- [ ] 3.4 GREEN: `runSessionGuarded` and session orchestration in `seed-dev-dataset.ts` (open, record by element name, complete, resume).
- [ ] 3.5 Integration: `ListReviewHistory` scopes per role (`manager@` equals the admin's list, `manager-nocap@` empty); heal after a crash; the completed draft is not reopened; a new template version opens no second draft; a QA edit survives; a deactivated assignment is skipped with a warning; no backdating. Branch on the lineage kind.
- [ ] 3.6 Docs: README reset section (`migrate reset` then `db seed`). `CLAUDE.md` "Dev data is nearly empty" bullet becomes the seeded dataset.
- [ ] 3.7 REFACTOR, run all suites. Manual browser check per role.
