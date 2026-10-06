# Verification Report: ci-pipeline

Mode: hybrid, Strict TDD (N/A for config/docs tasks; A.9 has RED/GREEN evidence). Verified at main 774a59c. Date 2026-10-06.
Verdict: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 3 SUGGESTION).

## Completeness
- tasks.md has A.1-A.9, G.1 and B.1-B.7 all ticked (17/17).
- C.1 (this verify) and C.2 (archive) are close-out phases, not implementation tasks.
- All delivery commits are on main: #189 merged at 8437978, #191 merged at 774a59c. Both confirmed via `gh pr view --json mergeCommit`.

## Execution evidence (live, read-only)
No local test runs. CI already ran the suites, and integration needs Docker.

| Evidence | Result |
|---|---|
| `gh run list` | 37502685198 PR #189 first run: failure (1/207 integration; fixed by A.9) |
| | 37504191872 PR #189 head 9a7b69f: success (job 2m14s) |
| | 37505671255 push main 8437978: success |
| | 37506363775 probe PR #190 `ci-pipeline/zz-barrier-probe`: failure |
| | 37507255249 PR #191: success |
| | 37507803314 push main 774a59c: success |
| `gh api commits/main/check-runs` | `ci`, success, app 15368 |
| `gh api .../branches/main/protection` | checks `[{context:ci, app_id:15368}]`, `strict:false`, `enforce_admins:true`, reviews null, restrictions null |
| `gh pr view 190` | state CLOSED, mergedAt null, closedAt 2026-10-06T17:51:38Z |
| `gh run view 37506363775` | Build/Lint/E2E/Integration success, Unit failure; the later tiers still ran as designed (`!cancelled()` gating) |
| `gh run list` cancelled filter | `[]`: no cancelled run exists |

## Spec compliance matrix

| Requirement / Scenario | Status | Evidence |
|---|---|---|
| **Triggers** | | |
| Pull request run | Compliant | Runs 37504191872 and 37507255249 (event `pull_request`) |
| Push to main run | Compliant | Runs 37505671255 and 37507803314 (event `push`, main) |
| No privileged trigger | Compliant | ci.yml `on:` has only `pull_request` and `push: branches: [main]` |
| **Verification tiers** | | |
| All tiers green | Compliant | Runs 37504191872, 37505671255, 37507255249, 37507803314: success |
| Build failure stops tests | Compliant by config only | Every test-tier step has `if: !cancelled() && steps.build.outcome == 'success'`, and `npm ci` and Build are plain steps. No failing-build run exists. |
| Test failure fails the run | Compliant | Run 37502685198 (integration) and 37506363775 (Unit) both concluded failure |
| Order | Compliant | Step order: install, build, lint, unit, e2e, integration. Lint and the test tiers keep running after an earlier tier fails; this still satisfies the ordering. |
| **Throwaway DB** | | |
| Fresh database | Compliant | `postgres:18-alpine` service container scoped to the job with a dummy `DATABASE_URL`. Integration passed on 4 green runs. No seed or migrate step. |
| **Least privilege** | | |
| No secrets, read-only token | Compliant | `permissions: contents: read`; no `secrets.*` in ci.yml; the DB URL is a dummy; checkout uses `persist-credentials: false` |
| **Stale run cancellation / duration** | | |
| Superseded PR run | Compliant by config only | Concurrency group keyed on the PR number or the sha, with `cancel-in-progress: event_name == 'pull_request'`. No cancelled run exists. Main runs are keyed by sha and never cancel. |
| Hung job | Compliant by config only | `timeout-minutes: 15` (tightened from 30 in #191). A timeout cannot be exercised safely. |
| **Documentation** | | |
| Reader finds CI policy | Compliant | README.md on main, "## Continuous integration" (lines 144-159): tiers, no admin bypass, non-strict, required `ci` |
| **Merge barrier** | | |
| Protection configuration | Compliant | API output above |
| Failing PR blocked for admin | Compliant | #190: run failed on Unit, `mergeStateStatus=BLOCKED`, `gh pr merge --admin` refused with "Required status check \"ci\" is failing" (per tasks.md B.6, not re-observed). Closed unmerged, and live state confirms. |
| Out-of-date branch mergeable | Compliant | `strict:false` confirmed live. #191 merged through the barrier. |
| Premature protection | Compliant | Protection was 404 until after green main run 37505671255 (B.2, B.3 ordering). Applied 2026-10-06 with the user's OK. |
| **Rollback ordering** | | |
| Reverting the workflow | Compliant by documentation | README line 157: "remove branch protection first, then revert the workflow". ADR-017 "Rollback": "Order matters: remove branch protection first". Not executed, which is correct. |

## Proposal success criteria
1. Workflow green on the change PR (37504191872) and on the push to main (37505671255): met.
2. Protection shows `ci` required, `enforce_admins` true, `strict` false: met.
3. Failing throwaway PR blocked including for the admin, then closed: met (#190).

## Design coherence
- `passThroughEnv: ["DATABASE_URL"]` is present in turbo.json on main (line 6).
- The ADR-017 and INDEX row (`Accepted`) exist.
- The job name `ci` and app id 15368 match the required check.
- Deviations are documented: A.9 (test fix) is added to tasks, and the timeout change 30 to 15 is recorded in tasks, the ADR (line 49) and the design duration notes.
- Strict TDD: A.9 has RED/GREEN evidence on a cold Jest cache. The other tasks are config/docs with N/A rows and the verification command recorded.

## Issues
### CRITICAL
None.

### WARNING
1. "Build failure stops tests" has no runtime evidence. It is verified by config inspection only, since no run with a failing build exists.
2. "Superseded PR run" and "Hung job" have no runtime evidence either. No cancelled or timed-out run exists, so both are verified by config only (concurrency block, `timeout-minutes: 15`). They are low risk because both use standard GitHub semantics.

### SUGGESTION
1. The 15-minute timeout has about 6x headroom over the measured 2m14s. It is easy to adjust if the suite grows.
2. `actions/checkout@v7` and `setup-node@v7` are pinned by major tag, not SHA. This is acceptable with a read-only token and no secrets. Consider SHA pinning if the threat model changes.
3. The README says "a direct push is only accepted for a commit that already has a green `ci` run". This is accurate for the config (no PR requirement), but it is a nuance reviewers may miss. The ADR already notes it.
