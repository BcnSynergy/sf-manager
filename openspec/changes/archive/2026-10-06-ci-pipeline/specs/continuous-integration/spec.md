# Continuous Integration Specification

## Purpose

Defines what CI runs automatically for SF-Manager, its security posture, and the merge-barrier policy on `main`.

## Requirements

### Requirement: Triggers

CI MUST run on `pull_request` and on `push` to `main`. CI MUST NOT use the `pull_request_target` trigger.

#### Scenario: Pull request run

- GIVEN a pull request targeting `main` is opened or updated
- WHEN GitHub processes the event
- THEN a CI run is started for that pull request

#### Scenario: Push to main run

- GIVEN a pull request is merged into `main`
- WHEN the push lands
- THEN a CI run is started for the resulting commit

#### Scenario: No privileged trigger

- GIVEN the workflow file
- WHEN its triggers are inspected
- THEN `pull_request_target` does not appear

### Requirement: Verification tiers

A CI run MUST execute, in this order, install, build, lint, unit tests, API e2e tests, and API integration tests, using the repository's existing scripts. Build MUST complete before any test tier, because Prisma client generation happens in the API build. Any failing tier MUST fail the run.

#### Scenario: All tiers green

- GIVEN a commit that builds, lints and passes all tests
- WHEN CI runs
- THEN every tier succeeds and the run concludes `success`

#### Scenario: Build failure stops tests

- GIVEN a commit whose build fails
- WHEN CI runs
- THEN the run concludes `failure` and no test tier executes

#### Scenario: Test failure fails the run

- GIVEN a commit with one failing test in any tier
- WHEN CI runs
- THEN the run concludes `failure`

### Requirement: Throwaway database for integration tests

The integration tier MUST have a PostgreSQL instance available that exists only for the duration of the run. CI MUST NOT require a seed or migrate step outside the test suite.

#### Scenario: Integration tier runs on a fresh database

- GIVEN a CI run reaches the integration tier
- WHEN the tests connect to PostgreSQL
- THEN they succeed against the run-scoped instance and no persistent database is touched

### Requirement: Least privilege

The workflow token MUST be read-only (`contents: read`). The workflow MUST NOT reference repository or organization secrets; any database URL it sets MUST be a non-sensitive dummy value.

#### Scenario: No secrets, read-only token

- GIVEN the workflow file
- WHEN its permissions and environment are inspected
- THEN only `contents: read` is granted and no `secrets.*` reference exists

### Requirement: Stale run cancellation and bounded duration

A newer run for the same pull request MUST cancel the in-progress older run. Runs on `main` MUST NOT be cancelled by other runs. The job MUST have an explicit timeout.

#### Scenario: Superseded PR run

- GIVEN a CI run is in progress for a pull request
- WHEN a new commit is pushed to that pull request
- THEN the older run is cancelled and a new run starts

#### Scenario: Hung job

- GIVEN a job exceeds its configured timeout
- WHEN the limit is reached
- THEN GitHub terminates it and the run concludes `failure`

### Requirement: Documentation

`README.md` MUST describe what CI runs and the `main` branch-protection policy (required check, no admin bypass, non-strict).

#### Scenario: Reader finds CI policy

- GIVEN the README on `main`
- WHEN a contributor looks for CI information
- THEN it states the tiers CI runs and the protection policy

### Requirement: Merge barrier on main

Branch protection on `main` MUST require the CI check, MUST set `enforce_admins` to true, and MUST set `strict` to false. Protection MUST be applied only after the CI check has completed at least once on `main`, and only with the repository owner's explicit approval.

#### Scenario: Protection configuration

- GIVEN protection has been applied
- WHEN `gh api repos/BcnSynergy/sf-manager/branches/main/protection` is queried
- THEN the CI check is listed as required, `enforce_admins.enabled` is true and `required_status_checks.strict` is false

#### Scenario: Failing PR blocked for admin

- GIVEN a throwaway pull request whose CI run fails
- WHEN the admin attempts to merge it
- THEN the merge is blocked, and the pull request is closed afterwards

#### Scenario: Out-of-date branch still mergeable

- GIVEN a pull request with a green CI run whose base has since advanced
- WHEN it is merged
- THEN no re-run or branch update is required

#### Scenario: Premature protection

- GIVEN the CI check has never run on `main`
- WHEN protection is about to be applied
- THEN it MUST NOT be applied until a green run exists

### Requirement: Rollback ordering

Branch protection MUST be removed before the CI workflow is reverted or deleted.

#### Scenario: Reverting the workflow

- GIVEN protection is active and the workflow must be removed
- WHEN the rollback is performed
- THEN protection is removed first, and the revert pull request then merges without the missing required check blocking it
