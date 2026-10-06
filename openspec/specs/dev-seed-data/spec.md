# Dev Seed Data

## Purpose

The development gate for seeded credentials, the dev dataset and its shared
password, and rerun idempotency. Developer tooling only: no web UI, no schema
change. The admin bootstrap and the migration-owned profile row are unchanged.

## Requirements

### Requirement: Development Allow-List Gate

Dev users and the dev dataset MUST be seeded only when `NODE_ENV` equals
`development`. Any other value, or unset, MUST skip them. The admin MUST be
seeded in every case. A skip MUST be logged with a clear message that names
the target database host (host only, never credentials).

#### Scenario: Development seeds

- GIVEN `NODE_ENV=development`
- WHEN the seed runs
- THEN the admin, dev users and dev dataset exist

#### Scenario: Non-development environments skip

- GIVEN `NODE_ENV` is unset, `test`, `staging` or `production`
- WHEN the seed runs
- THEN no dev user (technician included) and no dev dataset row exist
- AND the admin exists
- AND a message states the dev dataset was skipped
- AND the message names the target database host and no credentials

### Requirement: Local Environment Declares Development

The local `apps/api/.env` is untracked, so the developer sets it. A tracked
`apps/api/.env.example` MUST document `NODE_ENV=development`, and `README.md`
MUST instruct setting it. The seed MUST NOT force the value itself.

#### Scenario: Example file documents the gate

- GIVEN a fresh checkout
- WHEN `apps/api/.env.example` is read
- THEN it names `NODE_ENV` with value `development`
- AND the repo-root `README.md` instructs setting it in `apps/api/.env`
- AND a run without it logs a skip message naming `NODE_ENV=development`

### Requirement: Shared Dev Password

All dev users, technician included, MUST share one fixed password that is
valid under `PlainPassword`. The password and the accounts (`technician@`,
`rep@`, `companymgr@`, `manager@sf-manager.example`, plus any others) MUST be
documented in `README.md`.

#### Scenario: Password is valid and documented

- GIVEN the seeded dev users
- WHEN the documented password is checked against `PlainPassword`
- THEN it is accepted
- AND each seeded account email and the password appear in `README.md`

### Requirement: Dev Dataset Contents

Under the gate, the seed MUST create: 2 maintenance companies; users for the
4 non-admin roles, including two `MANAGER`s (one with `VIEW_ALL_REVIEWS`, one
without), with the `SYSTEM_ADMIN` coming from the unchanged admin bootstrap;
2 communities with asymmetric representative and technician assignments; 1 to
2 extinguishers per community; 3 to 5 checklist questions; 1 active
EXTINGUISHER x QUARTERLY template **and 1 active EXTINGUISHER x ANNUAL
template, and no EXTINGUISHER x MONTHLY template**; checklist questions
usable by both templates; **4** completed review sessions and 1 draft, being
`technician@` in Dev Seed Residences North on `QUARTERLY`, `technician@` in
Dev Seed Residences South on `QUARTERLY`, `technician2@` in South on
`QUARTERLY`, and `technician@` in North on `ANNUAL` (the only `ANNUAL`
session), plus the `rep@` draft in North on `QUARTERLY`; and a filled
organization profile.
(Previously: a single active EXTINGUISHER x MONTHLY template, a few completed
sessions and 1 draft, and no `ANNUAL` template or session.)

#### Scenario: Dataset shape

- GIVEN a database seeded under the gate
- WHEN the rows are counted
- THEN the counts match the ranges above and each of the 4 non-admin roles has a user
- AND the admin, seeded by the bootstrap, is the fifth role
- AND, among the seeded `MANAGER`s, exactly one holds `VIEW_ALL_REVIEWS`

#### Scenario: Templates are QUARTERLY and ANNUAL, never MONTHLY

- GIVEN a freshly reset database seeded under the gate
- WHEN the seeded EXTINGUISHER templates are read
- THEN an active EXTINGUISHER x QUARTERLY template and an active EXTINGUISHER x ANNUAL template exist
- AND no EXTINGUISHER x MONTHLY template exists

#### Scenario: Four completed sessions, one annual, in North only

- GIVEN a freshly reset database seeded under the gate
- WHEN the completed sessions are read
- THEN exactly four exist: `technician@` in North on `QUARTERLY`, `technician@` in South on `QUARTERLY`, `technician2@` in South on `QUARTERLY` and `technician@` in North on `ANNUAL`
- AND the only `ANNUAL` session is in Dev Seed Residences North
- AND each community has at least one completed `QUARTERLY` session
- AND the draft is `rep@` in North on `QUARTERLY`

#### Scenario: Organization profile overwritten

- GIVEN a profile row with different existing values
- WHEN the seed runs under the gate
- THEN the profile holds the seeded values

#### Scenario: No backdating

- GIVEN the sessions created by a given seed run
- WHEN their timestamps are read
- THEN all are from that run's time, none in the past
- AND sessions from earlier runs keep their original timestamps

### Requirement: Role-Scope Visibility

The dataset MUST let each role's Review history scope be checked.

#### Scenario: Scopes differ by role

- GIVEN the seeded dataset
- WHEN each role lists review history
- THEN technician, representative and company manager each see a non-empty subset differing from the admin's full list
- AND the `MANAGER` with `VIEW_ALL_REVIEWS` sees the admin's list
- AND the `MANAGER` without it sees nothing

### Requirement: Idempotent Additive Seeding

Rerunning the seed MUST create no duplicates and raise no error. Existing
records MUST be skipped, never removed. This holds for the added ANNUAL
template and ANNUAL session exactly as for every other seeded record.
(Previously: stated for the dataset without naming an ANNUAL template or session.)

#### Scenario: Second run

- GIVEN a database already seeded under the gate
- WHEN the seed runs again
- THEN all row counts of the seeded records are unchanged and no error occurs

#### Scenario: Second run adds no second annual template or session

- GIVEN a database already seeded under the gate
- WHEN the seed runs again
- THEN exactly one EXTINGUISHER x ANNUAL template lineage and exactly one completed `ANNUAL` session still exist
- AND exactly four completed sessions still exist

#### Scenario: A performer and community may hold one session per frequency

- GIVEN `technician@` already has a completed `QUARTERLY` session in North
- WHEN the seed runs and plans the `ANNUAL` session for `technician@` in North
- THEN the `ANNUAL` session is created and is not skipped as a duplicate of the `QUARTERLY` one

#### Scenario: The session key includes the frequency, resolved from the frozen template

- GIVEN seeded sessions whose template versions have been replaced by newer versions of the same frequency
- WHEN the seed runs
- THEN each session is matched to its plan by performer, community and the frequency of the template it was frozen against
- AND no second session is opened for any of those keys

#### Scenario: Partial data completed

- GIVEN a seed that stopped midway
- WHEN the seed runs again
- THEN the missing records are created and existing ones are not duplicated
- AND a seeded draft or completed-plan session left partially recorded gets only its missing planned entries recorded
- AND existing entries, including ones edited by QA, are never overwritten
- AND the missing entries are recorded against the session's own template version
- AND each planned entry targets its element by dataset name, never by query order

#### Scenario: Completed seeded draft is not reopened

- GIVEN the seeded draft was completed by its performer
- WHEN the seed runs again
- THEN no new draft is opened for that performer and community

#### Scenario: New template version does not open a second draft

- GIVEN a seeded draft or completed session for a performer, community and frequency, and a newer active template version of that frequency
- WHEN the seed runs
- THEN no additional draft or session is opened for that performer, community and frequency
- AND a seeded draft bound to the older version is still resumed and completed against that version

### Requirement: Fail-Soft on Conflicting State

A seeded user that cannot be created or has drifted MUST NOT abort the run
nor cause permanent bad data. The seed MUST log a warning naming the user and
pointing to `migrate reset` followed by `db seed`, skip that user and
everything depending on it (assignments, sessions), and continue with the
rest. It MUST NOT repair the row.

More generally, each planned session MUST run inside one guard that catches
the expected domain errors of the session use cases, logs a warning naming
the session plan, the performer, the community and the error, skips that
session, and lets the run continue. Non-domain errors MUST propagate. The
seed MUST NOT reactivate or modify existing assignments, elements or
templates that it does not own. These rules apply independently to the
QUARTERLY and the ANNUAL template lineages.
(Previously: the template scenarios named an EXTINGUISHER x MONTHLY template;
they now name QUARTERLY, and an ANNUAL scenario is added.)

#### Scenario: A seeded session whose preconditions were changed by QA is skipped with a warning and the run continues

- GIVEN a seeded session whose preconditions QA changed, for example a deactivated seeded assignment, a deactivated seeded element, or a template no longer usable
- WHEN the seed runs
- THEN a warning names the session plan, the performer, the community and the error
- AND that session is skipped and the changed rows stay as QA left them
- AND the remaining dataset is created and no error aborts the run

#### Scenario: Unexpected errors still propagate

- GIVEN a non-domain error raised while seeding a session
- WHEN the seed runs
- THEN the run fails with that error

#### Scenario: Soft-deleted seeded email

- GIVEN a soft-deleted user holding a seeded email
- WHEN the seed runs
- THEN a warning names that email
- AND that user's assignments and sessions are skipped
- AND the remaining dataset is created and no error aborts the run

#### Scenario: Drifted user

- GIVEN a seeded email whose user has a different role or company
- WHEN the seed runs
- THEN a warning names the user and points to `migrate reset` then `db seed`
- AND no assignment or session is written for that user
- AND the row is unchanged

#### Scenario: Foreign or unusable template blocks only new sessions

- GIVEN an EXTINGUISHER x QUARTERLY template draft that is not a seed draft with no active template, or an active template without questions
- WHEN the seed runs
- THEN the template is not modified or activated
- AND every new session that would open against it is skipped with a logged reason
- AND seeded drafts bound to a still-valid older version are still resumed
- AND the run does not abort

#### Scenario: Seed draft that cannot be finished blocks only new sessions

- GIVEN a seed draft for EXTINGUISHER x QUARTERLY with no active template
- AND setting its questions or activating it fails with an expected template domain error (for example, its questions were removed or it was activated concurrently)
- WHEN the seed runs
- THEN a warning names the draft and the error
- AND the draft stays a draft and is not activated
- AND every new session that would open against the lineage is skipped with a logged reason
- AND seeded drafts bound to a still-valid older version are still resumed
- AND the run does not abort
- AND a later run, once the cause is gone, finishes and activates the draft
- AND any other error still aborts the run

#### Scenario: An unusable ANNUAL template blocks only ANNUAL sessions

- GIVEN a foreign or unfinishable EXTINGUISHER x ANNUAL template state, as in the two scenarios above
- WHEN the seed runs
- THEN the ANNUAL template is not modified or activated and the ANNUAL session is skipped with a logged reason
- AND the outcome of one template lineage blocks only the new sessions of its own frequency
- AND the QUARTERLY template and sessions are created as usual
- AND the run does not abort

### Requirement: Review Schedule Visibility

On a freshly reset database seeded under the gate, the dataset MUST let the
review schedule show both an `UP_TO_DATE` and an `UPCOMING` pair for an
admin: Dev Seed Residences North `UP_TO_DATE` and Dev Seed Residences South
`UPCOMING`, because North's completed `ANNUAL` session covers its annual
obligation, while South has completed `QUARTERLY` sessions (two) and no
`ANNUAL` session on record. The seed MUST NOT backdate sessions to produce
this outcome, so the statuses hold on the day of the seed run and within the
same quarter; after a quarter change the database needs a reseed.

#### Scenario: Admin sees North up to date and South upcoming

- GIVEN a freshly reset database seeded under the gate, read on the day of the seed run
- WHEN a `SYSTEM_ADMIN` reads the review schedule
- THEN the EXTINGUISHER pair of Dev Seed Residences North is `UP_TO_DATE`
- AND the EXTINGUISHER pair of Dev Seed Residences South is `UPCOMING` for the annual obligation

#### Scenario: Scope still differs by role

- GIVEN the seeded dataset
- WHEN each role reads the review schedule
- THEN technician and representative each see only their assigned communities' pairs
- AND the `MANAGER` with `VIEW_ALL_REVIEWS` sees the admin's list
- AND the `MANAGER` without it sees an empty list
- AND the company manager is refused with `403`
