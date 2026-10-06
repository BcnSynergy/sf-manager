# Tasks: CI pipeline as a merge barrier on `main`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~155 (workflow ~65, ADR ~60, README ~15, INDEX 1, turbo.json 1) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (not exercised: single PR) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Workflow, turbo.json line, ADR-017, INDEX row, README | PR 1/1 | Base: main. Branch `ci-pipeline/01-ci-workflow`. Title `ci(workflow): PR 1/1 — CI workflow, ADR-017 and README note` |

Strict TDD: N/A for every task (config/docs, no app code). apply-progress "TDD Cycle Evidence" records N/A rows with the verification command used.

## Phase A: In-repo changes (sdd-apply)

- [x] A.1 `turbo.json`: add `"passThroughEnv": ["DATABASE_URL"]` to `build`. Spec: Verification tiers. TDD: N/A (config). Verify: `npx turbo run build --dry=json` lists it for `@sf-manager/api#build`.
- [x] A.2 Create `.github/workflows/ci.yml` per design sketch (single job `ci`, `ubuntu-24.04`, 30 min timeout, `postgres:18-alpine`, job-wide dummy `DATABASE_URL`). Confirm `actions/checkout` and `actions/setup-node` majors at write time. Spec: Triggers, Verification tiers, Throwaway database, Least privilege, Stale run cancellation. TDD: N/A (config).
- [x] A.3 Review `ci.yml` against spec: no `pull_request_target`, only `contents: read`, no `secrets.*`, build step `id: build`, test tiers gated on build success, concurrency cancels PR runs only. Verify: grep + manual read; YAML parse via a node one-liner if a YAML dependency already exists, else note manual review. TDD: N/A.
- [x] A.4 Create `docs/adr/ADR-017-ci-merge-barrier.md` (format of ADR-016; outline in design). Spec: Merge barrier, Rollback ordering. TDD: N/A (docs).
- [x] A.5 `docs/adr/INDEX.md`: add row `ADR-017 | CI as a merge barrier on main | Accepted`. No other INDEX edits (out of design scope). TDD: N/A (docs).
- [x] A.6 `README.md`: add `## Continuous integration` after "Other commands": tiers, Node 24, throwaway Postgres, no secrets, required `ci`, no admin bypass, non-strict, pointer to ADR-017 rollback. Spec: Documentation. TDD: N/A (docs).
- [x] A.7 Run `npm run lint`; confirm `git diff --stat` is ~155 lines and touches only the five files. TDD: N/A.
- [x] A.8 Commit as one work unit (conventional commit); docs and config travel with the workflow.
- [x] A.9 (added in B.1) Fix the latent order-dependent integration test the first CI run surfaced: `seed-dev-dataset.integration.spec.ts` test "a second run creates no duplicates..." asserted zero WARN without `resetLineages()`. Second commit on the same PR (`9a7b69f`). TDD: RED/GREEN reproduced locally on a cold Jest cache.

## Gate (orchestrator, not an apply task)

- [x] G.1 Fresh-context review before push, and again before merge; user confirms push, PR and merge explicitly. Done for #189 (pre-push full review, light review of the test fix, pre-merge review) and #191 (light pre-push and pre-merge reviews).

## Phase B: Post-merge rollout (orchestrator + user, NOT sdd-apply)

- [x] B.1 Observe the PR's own `ci` run: `npm ci` on npm 11 (fallback: add `npm i -g npm@10.8.2` step before `npm ci`), root lockfile cache hit, wall time, argon2 prebuilt. Spec: Verification tiers. Run 37502685198 failed 1/207 integration (see A.9); run 37504191872 green: `npm ci` 18s on npm 11 with no fallback needed and no argon2 compile, job 2m14s, cache saved keyed on the root lockfile and restored on run 37507255249.
- [x] B.2 After merge, confirm the `main` push run is green. Spec: Push to main run, Premature protection. #189 merged at 8437978; run 37505671255 green.
- [x] B.3 Pre-check name and app id: `gh api repos/BcnSynergy/sf-manager/commits/main/check-runs --jq '.check_runs[] | {name, conclusion, app: .app.id}'`. Result: `ci`, success, app 15368 (`github-actions`); protection was 404 before B.4.
- [x] B.4 With the user's explicit OK, apply protection via `gh api -X PUT` (payload in design). Spec: Merge barrier. Applied 2026-10-06 with the user's OK.
- [x] B.5 Verify with `gh api .../branches/main/protection`: `ci` required (app 15368), `enforce_admins` true, `strict` false. Spec: Protection configuration. Verified; no required reviews, no restrictions.
- [x] B.6 Barrier probe: branch `ci-pipeline/zz-barrier-probe` with a failing spec; PR shows `BLOCKED` and `gh pr merge` is refused; then `gh pr close --delete-branch`. Spec: Failing PR blocked for admin. PR #190: run 37506363775 failed on Unit only, `mergeStateStatus=BLOCKED`, `gh pr merge --admin` refused with "Required status check \"ci\" is failing"; closed unmerged, branch deleted.
- [x] B.7 Optional: tighten `timeout-minutes` from measured duration (separate tiny PR only if the user wants it). #191: 30 to 15, merged at 774a59c through the new protection; PR run 37507255249 and push run 37507803314 green.

## Phase C: Close

- [x] C.1 `sdd-verify` (after B.6). PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 3 SUGGESTION); see verify-report.md.
- [x] C.2 `sdd-archive`, only once protection is verified (B.5, B.6). Archived 2026-10-06; see archive-report.md.
