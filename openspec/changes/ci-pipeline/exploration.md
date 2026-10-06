## Exploration: ci-pipeline (GitHub Actions CI)

### Current State
- No `.github/` directory exists, so nothing is automated today.
- Node: root `engines.node` is `>=24`, `packageManager` is `npm@10.8.2`, and `package-lock.json` exists. There is no `.nvmrc` or `.node-version`.
- Root scripts (Turborepo): `build`, `dev`, `lint`, `test`.
  - `turbo.json` has `lint` and `test` depend on `^build` only, and `build` depend on `^build`.
- There is no root or per-workspace `typecheck` script.
  - `apps/api` `build` is `prisma generate && nest build`. `tsconfig.build.json` excludes `test`, `*spec.ts`, `prisma`, `src/shared/testing` and `src/shared/seeding`.
  - `apps/web` `build` is `tsc -b && vite build`.
  - `packages/validation` `build` is `tsc -p tsconfig.json`.
  - Test files are typechecked only when ts-jest runs them.
- Test tiers:

| Tier | Command | Needs |
|---|---|---|
| unit | `npm test` (turbo): api jest, web vitest, validation vitest | no DB |
| integration | `npm run test:integration -w apps/api` (`jest --config test/jest-integration.json --runInBand`) | Postgres |
| e2e | `npm run test:e2e -w apps/api` | no DB |

  - Both `test:integration` and `test:e2e` have a `pretest:*` hook that builds `@sf-manager/validation`.
  - API unit tests exclude `*.integration.spec.ts` and have a tripwire that refuses to run them.
- Integration setup (`apps/api/test/test-database/global-setup.ts`, helpers in `apps/api/src/shared/testing/test-database.ts`):
  - It reads `DATABASE_URL` from the shell, or else from `apps/api/.env`. In CI the shell value is the only source.
  - It creates `sf_manager_test_<id>` through the `/postgres` maintenance database (so the role needs CREATE DATABASE).
  - It runs `prisma migrate deploy` itself, so CI needs no separate migrate or seed step.
  - The run database is dropped at teardown.
  - It aborts if `DOTENV_CONFIG_OVERRIDE` is set. CI must not set it.
  - `JWT_SECRET` and `CORS_ORIGIN` are set inside the specs.
- E2E suite: `PrismaService` and the repositories are stubbed, so it needs no Postgres, migrations or seed.
  - One spec (`review-session.e2e-spec.ts`) reads `apps/web/src` from disk, so a web PR needs the e2e tier.
- Local Postgres is `postgres:18-alpine` with user, password and database all `sfmanager`, on port 5432 (`docker-compose.yml`).
- `prisma.config.ts` uses `env('DATABASE_URL')`, and `prisma.service.ts` builds `new PrismaPg({ connectionString: process.env.DATABASE_URL })`.
  - A dummy `DATABASE_URL` at job level is the safe default.
  - Whether `prisma generate` and the unit and e2e tiers need it is unverified; confirm in apply.
- `prisma generate` only runs inside `apps/api` `build`. Unit and e2e tests import the generated client, so the build must run before them.
- Timezone: `calendar-quarter.ts` passes `timeZone: 'Europe/Madrid'` explicitly to `Intl`. No `TZ` variable is needed, and Node 24 ships full ICU.
- No test tier needs browsers or Docker-in-Docker. Web tests use jsdom.

### Affected Areas
- `.github/workflows/ci.yml` (new) is the only deliverable.
- `README.md`: a short note on CI, the commands it runs, and the manual branch-protection step.
- `docs/adr/`: optional. The CI decision could become an ADR, or be noted under Open decisions in `INDEX.md`.
- No application code changes.

### Approaches
1. **Single job with Postgres service**: checkout, `setup-node` (24, `cache: npm`), `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e -w apps/api`, `npm run test:integration -w apps/api`.
   - Pros: simplest, one install and one build, easy to debug.
   - Cons: serial wall time; one failure hides later tiers unless steps use `if: always()`.
   - Effort: Low.
2. **Parallel jobs**: `static` (build, lint, unit, e2e) and `integration` (Postgres), possibly one job per workspace.
   - Pros: faster feedback, with separate required-check names.
   - Cons: duplicated install and build, which uses more runner minutes. More YAML and more check names to keep in sync with branch protection.
   - Effort: Medium.
3. **Turbo-driven everything**: add `typecheck` and `test:*` tasks to `turbo.json`.
   - Pros: a uniform entry point.
   - Cons: changes repo scripts, which is scope creep for a first slice.
   - Effort: Medium.

### Recommendation
Approach 1, sticking to existing scripts and adding no new repo scripts.
- Triggers: `pull_request` and `push` to `main`.
- Hardening: `permissions: contents: read`, a concurrency group that cancels stale PR runs, and `timeout-minutes`.
- Job env:
  - `DATABASE_URL=postgresql://sfmanager:sfmanager@localhost:5432/sfmanager` (a dummy value for a throwaway container).
  - `NODE_ENV=test`.
- Service container: `postgres:18-alpine` with a `pg_isready` health check. The superuser from `POSTGRES_USER` can create databases.
- A separate typecheck is redundant: `build` covers `src`, and ts-jest covers tests.
- Split into parallel jobs later, only if wall time proves painful.

**Scope per ADR-006** (thinnest first slice): one workflow file, the commands above, npm cache through `setup-node`, and a README note.

**Defer explicitly**:
- Branch protection / required checks. This is a repo setting the user applies manually after the workflow has run green at least once, because the check name must exist first.
- Deploy and release.
- Coverage upload.
- Turbo remote or other caching.
- Matrix builds.
- Dependabot.
- Browser or Playwright tests.
- A new typecheck script.

**Non-UI slice**: this change is deliberately infrastructure-only, with no domain and no web UI. The CLAUDE.md "every slice includes UI" rule targets domain slices and does not apply.

### Risks
- Node and npm: `setup-node` with 24 ships npm 11, while `packageManager` pins npm 10.8.2. `npm ci` against the existing lockfile should work, but verify on the first run. Pinning npm is a possible fix.
- Service-container health-check timing could cause a flaky first connection; use `pg_isready` retries.
- Duration is unknown. About 2,750 tests run, with `--runInBand` integration (207) and argon2 hashing in e2e. A cold first run may take 8 to 15 minutes. Measure it, and set `timeout-minutes` generously.
- Flakiness: concurrency-style integration tests, and the argon2 native build via `npm ci` (falls back to compiling if the prebuilt binary is missing).
- Secrets: the workflow needs none. A public repo plus fork PRs means `pull_request` runs with a read-only token and no secrets, which is fine here. Do not use `pull_request_target`.
- `JWT_SECRET` test values and the dev seed password are public and test-only. Neither is needed in CI.
- The dev seed is not run in CI. Integration builds its own database from migrations.
- Unverified: whether `prisma generate` needs `DATABASE_URL` (the dummy value avoids the question), and the real lint wall time (`lint` depends on `^build`).
- Branch protection is manual. If it is enabled before the workflow runs once, the required check name will not exist yet.

### Ready for Proposal
Yes.
