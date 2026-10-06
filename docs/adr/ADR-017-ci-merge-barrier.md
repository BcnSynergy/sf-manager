# ADR-017: CI as a merge barrier on main

## Status
Accepted

## Context
Until now nothing ran automatically: lint, unit, e2e and integration
suites were run by hand before merging. The repository has a single admin
who is also the only merger, so a mistake or a skipped check goes straight
to `main`. The test suites are already hermetic (the integration suite
creates and drops its own database, see `hermetic-integration-tests`),
which makes them cheap to run on a clean CI machine.

## Decision
- A GitHub Actions workflow (`.github/workflows/ci.yml`) runs one job,
  `ci`, on every pull request and on every push to `main`. It runs, in
  order: install, build, lint, unit tests, API e2e tests and API
  integration tests, using the repository's existing scripts, against a
  throwaway `postgres:18-alpine` service. After the build, the test tiers
  keep running if an earlier tier fails, so one run reports every failure.
- The workflow token is read-only (`contents: read`), no secrets are
  referenced, and `pull_request_target` is not used. The `DATABASE_URL`
  it sets is a dummy value for the service container.
- Branch protection on `main` requires the status check `ci`, bound to
  the GitHub Actions app (app id 15368) so no other integration can
  satisfy it by posting a status with the same name.
- `enforce_admins` is `true`: there is no admin bypass.
- `strict` is `false`: a branch does not have to be up to date with `main`
  before merging. With stacked-to-main PR chains, strict mode would force
  a rebase and a full re-run after every merge. The run triggered by the
  push to `main` is the safety net for the combined result.
- No pull-request review requirement (solo developer).
- Protection is applied only after `ci` has been green on `main` at least
  once, and only with the repository owner's explicit approval.

## Consequences
- A pull request is NOT required. Because `required_pull_request_reviews`
  is `null`, the admin can still push directly to `main`, but only a
  commit that already has a green `ci` run (for example from a pushed
  branch or a pull request). Any other direct push is rejected. The
  barrier guarantees that nothing unverified reaches `main`, not that
  everything goes through a pull request.
- Renaming the job breaks merges until protection is updated, because the
  required context no longer exists. Change the job name and the
  protection together.
- A broken CI blocks hotfixes too, since the admin has no bypass. Fixing
  the pipeline or removing protection (see rollback) is the only way out.
- The first green runs took about 2.2 minutes of job time (runs 37504191872
  and 37505671255). `timeout-minutes` is 15, which leaves room for the suite
  to grow while still failing a hung run quickly.
- Because `strict` is false, two individually green PRs can combine into a
  red `main`. This is detected by the push run, not prevented.

## Rollback
Order matters: remove branch protection first
(`gh api -X DELETE repos/BcnSynergy/sf-manager/branches/main/protection`,
or via Settings), then revert or delete the workflow through a pull
request. Reverting the workflow first would leave a required check that
can never be reported, blocking every merge.

## Alternatives Considered
- **Signal-only CI (no required check)** — rejected: it does not stop a
  broken change from reaching `main`, which is the problem to solve.
- **Strict mode (branch must be up to date)** — rejected: forces a rebase
  and a full re-run after each merge of a stacked chain, for little gain on
  a solo repository.
- **Admin bypass** — rejected: the admin is the only merger, so a bypass
  would make the barrier optional for the one person it applies to.
- **Repository rulesets** — rejected: classic branch protection offers
  everything needed here, and its API is simpler to verify.
