# Proposal: CI pipeline as a merge barrier on `main`

## Intent

Nothing runs automatically today (no `.github/`). Build, lint and about 2,750 tests run only when someone remembers. Broken code can reach `main`. This change makes CI a real merge barrier on `main`. The barrier applies to the sole admin too.

This is infrastructure only, with no domain and no web UI. The CLAUDE.md "every slice includes UI" rule targets domain slices, so it does not apply here. ADR-006 still applies: this is the thinnest useful slice.

## Scope

### In Scope
- `.github/workflows/ci.yml`: a single job on Node 24 with `cache: npm` and a `postgres:18-alpine` service (`pg_isready` health check). Steps: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e -w apps/api`, `npm run test:integration -w apps/api`.
- Triggers: `pull_request` and `push` to `main`. Never `pull_request_target`.
- Hardening: `permissions: contents: read`, a concurrency group that cancels stale PR runs, `timeout-minutes`, a dummy `DATABASE_URL`, and no secrets.
- A short README note covering what CI runs and the branch-protection policy.
- Branch protection on `main`: the CI check is required, with `enforce_admins: true` and `strict: false`. It is applied after the workflow is merged.
- One-line `turbo.json` change: `"passThroughEnv": ["DATABASE_URL"]` on the `build` task. Scoped exception to the "no config changes" line below, approved by the user during design review: Turbo 2.x strict env mode hides `DATABASE_URL` from `prisma generate`, which fails without it, and CI has no `apps/api/.env`.

### Out of Scope
- Deploy or release, coverage upload, matrix builds, Dependabot, Playwright or browser tests.
- Turbo remote caching or extra caching, a `typecheck` script, any new repo scripts or app code changes, and any other repo config change (the `turbo.json` line above is the only exception).
- Splitting the job into parallel jobs (only if wall time proves painful).

## Capabilities

### New Capabilities
- `continuous-integration`: what CI runs, its triggers and security posture, and the `main` merge-barrier policy.

### Modified Capabilities
None.

## Approach

The job runs the existing scripts in series, with one install and one build. Integration tests create their own database from migrations, so there is no seed or migrate step. Delivery has two steps:
1. Workflow PR, merged once its own run is green.
2. Branch protection, applied afterwards (the check name must exist first). The orchestrator applies it via `gh api` with the user's explicit OK, or the user applies it in Settings.

The change is not archived until protection is active and verified. `strict: false` is chosen because the push-to-main run is the safety net. Stacked-to-main chains would otherwise need a full re-run for each PR.

**ADR recommendation**: write a short ADR-017 ("CI as a merge barrier"). It should not be just an INDEX note. The no-bypass policy (`enforce_admins`) and the non-strict tradeoff are durable governance rules that are not obvious from the code.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | New | CI workflow |
| `README.md` | Modified | CI note |
| `turbo.json` | Modified | `passThroughEnv: ["DATABASE_URL"]` on `build` |
| `docs/adr/` | New (recommended) | ADR-017 + INDEX row |
| GitHub `main` settings | Modified | Branch protection |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| npm 11 (from setup-node 24) vs the pinned `npm@10.8.2` | Med | Verify on the first run; pin npm if `npm ci` fails |
| Unknown duration (cold run may take 8-15 min) | Med | Set `timeout-minutes` generously and measure |
| argon2 native build falls back to compiling | Low | Check the first-run logs |
| Postgres service not ready in time | Low | `pg_isready` retries |
| Protection enabled before the check name exists | Med | Strict ordering: the workflow must be green on `main` first |
| `enforce_admins` blocks a hotfix when CI is broken | Low | Temporarily remove protection (see the rollback plan) |

## Rollback Plan

- Remove protection: `gh api -X DELETE repos/BcnSynergy/sf-manager/branches/main/protection`, or use Settings.
- Revert or delete `ci.yml` through a PR. Protection must be removed first, or the barrier blocks the revert.

## Dependencies

- Admin rights on `BcnSynergy/sf-manager`, and the user's explicit OK for the protection step.

## Success Criteria

- [ ] The workflow runs green on the change PR and on the resulting push to `main`.
- [ ] `gh api repos/BcnSynergy/sf-manager/branches/main/protection` shows the CI check as required, with `enforce_admins.enabled: true` and `strict: false`.
- [ ] A deliberately failing throwaway PR shows merge blocked, including for the admin. The PR is then closed.

## Size

Expected well under 400 lines: a single PR plus one manual settings step.
