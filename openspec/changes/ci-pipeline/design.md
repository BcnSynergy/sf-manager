# Design: CI pipeline as a merge barrier on `main`

## Technical Approach

The design adds one GitHub Actions workflow with a single job. The job runs the existing repo scripts in series against a throwaway `postgres:18-alpine` service. After the workflow is green on `main`, branch protection makes that job's check required for everyone, including the admin. ADR-017 records the governance rules and the README documents them. The change touches no app code and adds no repo scripts (ADR-006). The only repo config change is one `passThroughEnv` line in `turbo.json`, the scoped exception approved in the amended proposal.

## Architecture Decisions

| Topic | Choice | Rejected | Rationale |
|---|---|---|---|
| Check identity | Workflow `name: CI`, job id `ci`, job `name: ci`. **Required context: `ci`**, bound to the GitHub Actions app (`app_id: 15368`, verified via `gh api apps/github-actions`). | Generic or long job names; `contexts` without an app | The check-run name is the job `name`. A short, stable name avoids drift with protection. Binding to the app prevents another integration from satisfying the check by posting a status with the same name. |
| Action pinning | `actions/checkout@v7` (current release v7.0.1) and `actions/setup-node@v7` (current release v7.0.0) major tags, plus `persist-credentials: false` | Full SHA pins | Both are first-party GitHub actions, the token is read-only and no secrets exist. Dependabot is out of scope, so SHA pins would go stale silently. Apply confirms the current major at write time. |
| Tier continuation | `lint`, `unit`, `e2e` and `integration` each use `if: ${{ !cancelled() && steps.build.outcome == 'success' }}` | Plain serial run; `if: always()` | One run reports every failing tier, which saves a full re-run of about 10 minutes. A build failure still skips every test tier, as the spec's "Build failure stops tests" scenario requires. `always()` would also run after cancellation or a build failure. Any failed step still fails the job. |
| `DATABASE_URL` | Job-wide `postgresql://sfmanager:sfmanager@localhost:5432/sfmanager` (a dummy value, not a secret) | Setting it only on the integration step | `apps/api/prisma.config.ts` evaluates `env('DATABASE_URL')`, and Prisma's `env()` throws when the variable is unset. Every Prisma CLI command loads that config, including the `prisma generate` inside `build`. Integration needs it as its base URL (`read-base-database-url.ts`), and there is no `.env` in CI. Setting it job-wide is harmless for unit and e2e. Under `turbo run build` it only reaches Prisma through the `passThroughEnv` decision below. |
| Turbo strict env mode | `turbo.json` `build` task gets `"passThroughEnv": ["DATABASE_URL"]` | `TURBO_ENV_MODE: loose` in the workflow; `env: ["DATABASE_URL"]` on the task | Turbo 2.10.11 runs in strict env mode (`--dry=json` shows `envMode: strict`, and `@sf-manager/api#build` declares no env), so the job-wide variable is filtered out before `prisma generate`. Without it, `prisma.config.ts` fails with `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`. Locally this is hidden because `dotenv/config` loads `apps/api/.env`, which CI does not have. `passThroughEnv` exposes the variable without adding it to the cache hash, which is right for a connection string that does not change build output. `env` would hash it. Loose mode would make CI diverge from local and keep the dependency undeclared. The `lint` and `test` turbo tasks do not need it, and integration and e2e run through `npm -w`, not turbo. |
| `NODE_ENV` | Not set | `NODE_ENV=test` job-wide | Jest and Vitest set it themselves. A job-wide `test` value would leak into `vite build`. |
| `DOTENV_CONFIG_OVERRIDE` | Never set | — | `findDotenvOverride` aborts integration setup if it is present. Neither the workflow nor setup-node sets it. |
| Postgres role | `POSTGRES_USER=sfmanager` (the image superuser) | A dedicated non-superuser role | Global setup runs `CREATE DATABASE` and `DROP DATABASE ... WITH (FORCE)` through `/postgres`, and the superuser can do both. This mirrors `docker-compose.yml`. |
| npm version | Use the npm bundled with Node 24 (npm 11); do not pin up front | `npm i -g npm@10.8.2`; corepack | npm does not enforce `packageManager`, and only corepack would. Corepack is no longer bundled from Node 25 onward. Lockfile v3 is read by npm 10 and 11 alike. **Fallback**: if `npm ci` fails on the first run, add a `npm i -g npm@10.8.2` step before `npm ci`. |
| Runner | `ubuntu-24.04` | `ubuntu-latest` | The runner image cannot change silently under a required check. |
| Timeout | `timeout-minutes: 30` | 15 | The cold run estimate is 8 to 15 minutes, and 30 leaves 2x headroom. Tighten it after measuring. |
| Concurrency | group `${{ github.workflow }}-${{ github.event.pull_request.number \|\| github.sha }}`, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` | `github.ref` group | PR runs share one group per PR and cancel each other. Main pushes get a group per SHA and are never cancelled. |
| Triggers | `pull_request` (any base) + `push` on `[main]` | `pull_request_target`; filtering PRs to `main` | No privileged context reaches fork code. An unfiltered PR trigger costs nothing and covers future non-main bases. |
| Protection mechanism | Classic branch protection API | Repository rulesets | The spec's verification uses `branches/main/protection`. Rulesets add nothing a solo repo needs. Branch protection is available on Free for public repos. |

## Workflow sketch (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  ci:
    name: ci
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    env:
      DATABASE_URL: postgresql://sfmanager:sfmanager@localhost:5432/sfmanager
    services:
      postgres:
        image: postgres:18-alpine
        env: { POSTGRES_USER: sfmanager, POSTGRES_PASSWORD: sfmanager, POSTGRES_DB: sfmanager }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U sfmanager -d sfmanager"
          --health-interval 5s --health-timeout 5s --health-retries 12
    steps:
      - uses: actions/checkout@v7
        with: { persist-credentials: false }
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - id: build
        run: npm run build
      - name: Lint
        if: ${{ !cancelled() && steps.build.outcome == 'success' }}
        run: npm run lint
      - name: Unit
        if: ${{ !cancelled() && steps.build.outcome == 'success' }}
        run: npm test
      - name: E2E
        if: ${{ !cancelled() && steps.build.outcome == 'success' }}
        run: npm run test:e2e -w apps/api
      - name: Integration
        if: ${{ !cancelled() && steps.build.outcome == 'success' }}
        run: npm run test:integration -w apps/api
```

`turbo.json` change (the only config edit):

```json
"build": {
  "dependsOn": ["^build"],
  "passThroughEnv": ["DATABASE_URL"],
  "outputs": ["dist/**", "build/**"]
}
```

## Data Flow

    PR / push --> job ci --> npm ci --> build (prisma generate + nest/tsc/vite)
                                         |-- lint
                                         |-- unit --> e2e (stubbed, no DB)
                                         `-- integration --> postgres service
                                               (sf_manager_test_<id>, created,
                                                migrated and dropped by global setup)
    check run "ci" --> required by main protection (enforce_admins)

## File Changes

| File | Action | Description |
|---|---|---|
| `.github/workflows/ci.yml` | Create | Workflow above (~65 lines) |
| `turbo.json` | Modify | Add `"passThroughEnv": ["DATABASE_URL"]` to `build` (1 line) |
| `docs/adr/ADR-017-ci-merge-barrier.md` | Create | Governance ADR (~60 lines) |
| `docs/adr/INDEX.md` | Modify | Add the row `ADR-017 \| CI as a merge barrier on main \| Accepted` |
| `README.md` | Modify | Add a `## Continuous integration` section after "Other commands" (~15 lines) |

**ADR-017 outline** (format follows ADR-016):
- **Context**: nothing ran automatically before, and there is a single admin and merger.
- **Decision**: the job and tiers; required check `ci`, bound to Actions; `enforce_admins: true`, so there is no bypass; `strict: false`, with the push-to-main run as the safety net for stacked-to-main chains; no PR-review requirement (solo developer).
- **Consequences**: a PR is NOT required. With `required_pull_request_reviews: null`, the admin can still push directly to `main` when that exact SHA already has a green `ci` run (for example, from a pushed branch or PR); any other direct push is rejected. Renaming the job breaks merges until protection is updated. A broken CI blocks hotfixes.
- **Rollback order**: remove protection first, then revert the workflow.
- **Alternatives**: signal-only CI, strict mode, admin bypass, rulesets.

**README outline**:
- What CI runs (the tiers, Node 24, and the throwaway Postgres; there are no secrets).
- The policy: `ci` is required on `main`, with no admin bypass and no up-to-date requirement.
- A pointer to ADR-017 for the rollback steps.

## Interfaces / Contracts

Apply protection only after the workflow is merged, `ci` is green on the `main` push, and the user gives an explicit OK. Pre-check the check name and app id first:

```
gh api repos/BcnSynergy/sf-manager/commits/main/check-runs --jq '.check_runs[] | {name, conclusion, app: .app.id}'
gh api -X PUT repos/BcnSynergy/sf-manager/branches/main/protection --input - <<'EOF'
{"required_status_checks":{"strict":false,"checks":[{"context":"ci","app_id":15368}]},
 "enforce_admins":true,"required_pull_request_reviews":null,"restrictions":null}
EOF
gh api repos/BcnSynergy/sf-manager/branches/main/protection --jq '{checks: .required_status_checks.checks, strict: .required_status_checks.strict, admins: .enforce_admins.enabled}'
```

**Protection side effect**: this payload requires a green `ci` check, not a PR. Because `required_pull_request_reviews` is `null`, a direct push to `main` (admin included) is accepted only when the pushed SHA already has a successful `ci` check run; otherwise it is rejected. The barrier guarantees "nothing unverified reaches `main`", not "everything goes through a PR".

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Turbo env | `DATABASE_URL` reaches `prisma generate` | Before push: `npx turbo run build --dry=json` lists `DATABASE_URL` in `passThroughEnv` for `@sf-manager/api#build`. In CI: the first run's build step is green. |
| Workflow | All tiers green | The change PR's own run, then the `main` push run |
| Barrier | A failing PR is blocked for the admin | Throwaway branch `ci-pipeline/zz-barrier-probe` adds a spec containing `expect(true).toBe(false)`. Open the PR and wait for `ci` to fail. Expect `gh pr view N --json mergeStateStatus` to return `BLOCKED`, and `gh pr merge N --merge` to be refused. Then `gh pr close N --delete-branch`. Nothing reaches `main`. |
| Config | The protection fields | The verification `gh api` command above |

There are no new code tests: the change contains no app logic, so Strict TDD does not apply to the YAML, the `turbo.json` line and the docs.

## Migration / Rollout

1. Open a single PR. Branch: `ci-pipeline/01-ci-workflow`. Title: `ci(workflow): PR 1/1 — CI workflow, ADR-017 and README note`. Size is about 155 changed lines (workflow, `turbo.json` line, ADR, INDEX, README), under 400.
2. Run a fresh-context review, then merge once the PR's own `ci` run is green.
3. Confirm the `main` push run is green.
4. Pre-check the check name and app id, get the user's OK, apply protection, and run the verification command.
5. Run the throwaway barrier probe.
6. Archive.

**Rollback**:
1. `gh api -X DELETE repos/BcnSynergy/sf-manager/branches/main/protection`, or use Settings.
2. Then revert or delete `ci.yml` through a PR.

## Open Questions

- [ ] Does `npm ci` succeed with npm 11? This is verified on the first run, and the fallback is the npm pin step.
- [ ] What are the real wall time and the argon2 prebuilt status? Measure them on the first run, then tighten `timeout-minutes`.
- [x] Is `15368` the app id? Verified via `gh api apps/github-actions`; the pre-check still confirms it on the real check run.
- [ ] Does setup-node `cache: npm` resolve the root `package-lock.json` in this workspaces repo? Confirm in the first-run logs (cache key / restore lines).
