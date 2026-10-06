# Archive Report: ci-pipeline

**Change**: ci-pipeline - CI pipeline as a merge barrier on `main`
**Archived**: 2026-10-06
**Archived to**: `openspec/changes/archive/2026-10-06-ci-pipeline/`
**Mode**: hybrid (filesystem merge plus Engram report)
**Verdict carried from sdd-verify**: PASS WITH WARNINGS - 0 CRITICAL, 2 WARNING, 3 SUGGESTION. Archived as **intentional-with-warnings**: the warnings are non-blocking and are carried below.
**Engram traceability**: explore `sdd/ci-pipeline/explore` (#438), proposal `sdd/ci-pipeline/proposal` (#440), spec `sdd/ci-pipeline/spec` (#441), design `sdd/ci-pipeline/design` (#442), tasks `sdd/ci-pipeline/tasks` (#444), apply-progress `sdd/ci-pipeline/apply-progress` (#445), verify-report `sdd/ci-pipeline/verify-report` (#449, mirrored in `verify-report.md`). Gating policy decision: #439.

## Summary

Nothing ran automatically before this change (no `.github/`). CI now runs build, lint, unit, API e2e and API integration tests on every pull request and on every push to `main`. `main` is protected so that the `ci` check is a real merge barrier, and the barrier applies to the sole admin as well (`enforce_admins: true`). Infrastructure only: no domain code and no web UI, so the "every slice includes UI" rule does not apply.

## Task Completion Gate

Read `tasks.md` before the archive. A.1-A.9, G.1, B.1-B.7 and C.1 are all `[x]` (17 implementation and rollout tasks plus C.1 verify). C.2 is the archive task itself; the orchestrator ticked it once this report was written. Before the move, the orchestrator updated `tasks.md` and `apply-progress.md` to record the A.9 test fix and the Phase B results; no other archived file was modified.

## Preconditions confirmed

- Verify verdict PASS WITH WARNINGS with 0 CRITICAL: archive allowed.
- Branch protection verified live (B.5) and the barrier probe verified (B.6), which is the proposal's condition for archiving.
- All three proposal success criteria met (workflow green on the PR and on the push to main; protection shows `ci` required, `enforce_admins` true, `strict` false; failing probe PR blocked for the admin, then closed).

## Specs Synced

| Capability | Action | Requirements |
|---|---|---|
| `continuous-integration` | Created (new capability; the delta was a full spec, no existing main spec) | 8 requirements: Triggers; Verification tiers; Throwaway database; Least privilege; Stale run cancellation and duration; Documentation; Merge barrier; Rollback ordering |

Main spec file: `openspec/specs/continuous-integration/spec.md` (byte-identical copy of the change spec, made by the orchestrator). No other main spec was touched. No MODIFIED or REMOVED requirements.

## Delivered PRs (stacked-to-main, single planned PR plus one follow-up)

| PR | Result |
|---|---|
| #189 `ci-pipeline/01-ci-workflow` | Merged at `8437978`. Workflow, `turbo.json` `passThroughEnv`, ADR-017, INDEX row, README note, plus the test fix `9a7b69f` (A.9) |
| #190 `ci-pipeline/zz-barrier-probe` | Throwaway barrier probe with a deliberately failing spec. Closed unmerged, branch deleted |
| #191 `ci-pipeline/02-tighten-timeout` | Merged at `774a59c`, through the new protection. `timeout-minutes` 30 to 15 (B.7) |

This archive lands on branch `ci-pipeline/03-archive`.

## Workflow runs

| Run | Subject | Result |
|---|---|---|
| 37502685198 | PR #189 first run | failure, 1/207 integration tests (order-dependent test, fixed by A.9) |
| 37504191872 | PR #189 head `9a7b69f` | success, job 2m14s |
| 37505671255 | push main `8437978` | success |
| 37506363775 | probe PR #190 | failure on Unit only, as intended; Build/Lint/E2E/Integration ran and passed |
| 37507255249 | PR #191 | success (cache restored) |
| 37507803314 | push main `774a59c` | success |

## Branch protection state (live on `main`)

- Required status check: `ci`, app id 15368 (`github-actions`).
- `enforce_admins`: true. `strict`: false. No required reviews, no push restrictions.
- Applied 2026-10-06 with the user's explicit OK, only after the push-to-main run was green (the check name had to exist first; protection was 404 until then).
- Probe evidence (B.6): PR #190 showed `mergeStateStatus=BLOCKED`, and `gh pr merge --admin` was refused with "Required status check \"ci\" is failing".
- Rollback order (documented in README and ADR-017): remove branch protection first, then revert the workflow.

## Archive Contents

- `proposal.md` yes
- `explore.md` yes
- `specs/continuous-integration/spec.md` yes
- `design.md` yes
- `tasks.md` yes (all tasks ticked, including C.2 for this archive)
- `apply-progress.md` yes
- `verify-report.md` yes
- `archive-report.md` yes (this file)

## Warnings carried forward

- **W-1**: "Build failure stops tests" has config-only evidence. Every test-tier step is gated on `steps.build.outcome == 'success'`, but no run with a failing build exists.
- **W-2**: "Superseded PR run" (concurrency cancellation) and "Hung job" (`timeout-minutes: 15`) have config-only evidence. No cancelled or timed-out run exists, and a timeout cannot be exercised safely. Both rely on standard GitHub semantics, so the risk is low.

### Accepted suggestions

- **S-1**: The 15-minute timeout has about 6x headroom over the measured 2m14s. Adjust it if the suite grows.
- **S-2**: `actions/checkout@v7` and `actions/setup-node@v7` are pinned by major tag, not SHA. Acceptable with a read-only token and no secrets.
- **S-3**: The README line "a direct push is only accepted for a commit that already has a green `ci` run" is accurate (no PR requirement is configured) but easy to misread. ADR-017 already records the nuance.

## Follow-ups and deferred items (open, NOT to do now - ADR-006)

Recorded so they are not forgotten; none is part of this change and none should start without a slice that needs it.

1. Deploy or release automation.
2. Coverage upload or reporting.
3. Matrix builds (other Node versions or operating systems).
4. Dependabot or other dependency automation.
5. Playwright or browser tests in CI.
6. Turbo remote caching or any extra caching beyond `cache: npm`.
7. A dedicated `typecheck` script.
8. Splitting the single job into parallel jobs, only if wall time becomes painful (currently about 2.2 minutes).
9. Consider SHA-pinning third-party actions if the threat model changes (S-2).

## Lessons learned

- **Turbo strict env hid `DATABASE_URL`**: Turbo 2.x strict env mode hides the variable from `prisma generate`, which fails without it, and CI has no `apps/api/.env`. Fixed with `passThroughEnv: ["DATABASE_URL"]` on `build`.
- **A cold Jest cache exposed an order-dependent integration test**: `seed-dev-dataset.integration.spec.ts` asserted zero WARN without `resetLineages()`. It passed locally only because of warm cache ordering. The first CI run caught it (1/207) and A.9 fixed it. A clean CI environment is a useful detector for hidden test coupling.
- **Actual duration beat the estimate**: the job took about 2.2 minutes (2m14s) against the proposal's 8-15 minute estimate. `npm ci` ran in 18s on npm 11 with no fallback to the pinned npm and no argon2 compile. This justified tightening the timeout from 30 to 15 minutes.
- **Ordering matters for the barrier**: protection was applied only after a green run on `main`, which avoided a required check that did not yet exist.

## Source folder removal and commit

The `sdd-archive` executor has no Bash access. The orchestrator moved the folder with `git mv` (every file a rename), created the main spec as a byte-identical copy, and handles the commit on branch `ci-pipeline/03-archive`. `openspec/changes/ci-pipeline/` no longer exists.

## SDD Cycle Complete

The change has been fully planned, implemented, verified and archived. `ci-pipeline` is closed.
