# Demo Seed Data

## Purpose

The public demo's fictitious dataset (`demo-instance`, phase 2): a property
manager with its logo, maintenance companies, communities, extinguishers
with fixed QR codes, the extinguisher checklist and a review history that
looks lived in. The demo's nightly reset seeds it on an empty database, so
every visitor finds the same data. Approved by the user as draft v1
(2026-11-27); the literals live in `apps/api/src/shared/seeding/demo-dataset.ts`.

It reuses the dev seed's engine (`dev-seed-data`): everything goes through
the real use cases. The dev dataset and its gate are unchanged. No web UI:
showing the demo credentials on the login page is `demo-instance` phase 4.

## Requirements

### Requirement: Explicit Demo Flag Gate

The demo seed entry (`demo-seed.main.ts`) MUST seed the system admin and
the demo dataset only when `SEED_DEMO_DATA` equals exactly `true` (no case
or whitespace normalization). Any other value, or unset, MUST write
nothing, the admin included, MUST log a message that names the flag and the
target database host (host only, never credentials), and MUST exit with a
non-zero status. `NODE_ENV` MUST play no part, and the entry MUST NOT seed
the dev dataset.

#### Scenario: The flag seeds the demo

- GIVEN `SEED_DEMO_DATA=true` and an empty, migrated database
- WHEN the demo seed entry runs
- THEN the admin and the demo dataset exist
- AND no dev dataset row exists

#### Scenario: Any other value writes nothing

- GIVEN `SEED_DEMO_DATA` is unset, `false`, `TRUE`, ` true` or `1`
- WHEN the demo seed entry runs
- THEN no row is written, not even the admin
- AND a message names `SEED_DEMO_DATA=true` and the target database host
- AND the process exits with a non-zero status

### Requirement: Demo Dataset Contents

The demo dataset MUST contain:

- the organization profile with its six fields filled (name `Finques
Mediterrània`) and an SVG logo uploaded through the logo use case;
- three maintenance companies, one with two technicians and two with one,
  each with a company manager;
- one `MANAGER` with `VIEW_ALL_REVIEWS`, four `MAINTENANCE_TECHNICIAN`s and
  three `COMMUNITY_REPRESENTATIVE`s, all with emails at
  `demo.sf-manager.example` and the one public password `sf-manager-demo-1`,
  which `PlainPassword` accepts; no `SYSTEM_ADMIN`, whose credentials are
  never public;
- six communities (three `es`, three `ca`), each with exactly one
  representative and its technicians;
- three to five extinguishers per community, twenty-four in all;
- the user's twenty checklist questions in Spanish: fifteen tagged
  `QUARTERLY` and `ANNUAL`, five tagged `ANNUAL` only;
- one active extinguisher template per frequency: the quarterly one asks the
  fifteen quarterly questions, the annual one asks those fifteen and then
  the five annual ones.

Every literal MUST pass the shared request schemas unchanged, and no email
or tax id MAY be one the dev dataset uses.

#### Scenario: The templates ask the user's questions

- GIVEN the demo dataset was seeded
- WHEN the active extinguisher templates are read
- THEN the quarterly one asks fifteen questions in the dataset order
- AND the annual one asks the same fifteen followed by the five annual ones

#### Scenario: Profile and logo are set

- GIVEN the demo dataset was seeded
- WHEN the organization profile is read
- THEN its six fields hold the dataset values
- AND its logo is an SVG image

### Requirement: Fixed Element Codes

Each demo extinguisher MUST be created with its own fixed code, the one its
QR label encodes, so a printed sheet of the demo's QR codes stays valid
after every reset. The codes MUST be `DEM` + the community's two-letter key
(`MA`, `JA`, `SE`, `PR`, `VD`, `TR`) + `EXT` + `22` to `26`, numbered in
dataset order, and each MUST be a valid element code. Elements without a
fixed code (the dev dataset) keep their generated code.

#### Scenario: Codes survive a reset

- GIVEN the demo dataset was seeded on an empty database
- WHEN the database is emptied and the demo dataset is seeded again
- THEN each extinguisher has the same code as before, in the same community

### Requirement: A Signature for Every Signer

Every technician and representative of the demo dataset MUST have a
registered signature right after seeding, whether or not they perform a
seeded session, so a demo visitor in either role can sign a review at once.
Each MUST be a different PNG image.

#### Scenario: A representative signs without uploading

- GIVEN the demo dataset was seeded
- WHEN a demo representative completes a review session
- THEN the completion succeeds with their seeded signature

### Requirement: Seeded Review History

The demo dataset MUST seed twelve review sessions, one to three per
community: eleven completed and one draft (a technician's quarterly review
with two of five extinguishers recorded). Every annual session MUST be
performed by a technician; at least five quarterly sessions MUST be
performed by representatives. Each performer MUST be assigned to the
session's community in their role. Three completed sessions MUST hold a NO
answer, each on the one question its entry names (a seal, a restamping and a
pressure check); every other answer MUST be YES. Each completed session MUST
carry its performer's signature copy, and a representative's session MUST
have no performing company.

#### Scenario: Who performed what

- GIVEN the demo dataset was seeded
- WHEN its sessions are read
- THEN every annual session's performer is a technician
- AND at least five quarterly sessions' performers are representatives
- AND those representative sessions have no performing company

### Requirement: Backdated Review Dates

The review use cases stamp the current time, so the demo seed MUST move
each completed session's dates back by the days the dataset gives it, so the
schedule shows up-to-date, due and overdue obligations on every reset: the
session completes at 10:30 UTC on that day, starts 30 minutes earlier, and
its entries are recorded 15 minutes after the start. Only a session the run
completes MUST be moved; a draft keeps the seeding time. The review use cases
MUST NOT change.

#### Scenario: A completed session is dated in the past

- GIVEN a dataset session completed 60 days ago
- WHEN the demo dataset is seeded
- THEN that session's completion date is 60 days before the seeding day, at 10:30 UTC
- AND its entries are recorded within it

### Requirement: Rerun Changes Nothing

Like the dev seed (`dev-seed-data` _Idempotent Additive Seeding_), a second
run on a seeded database MUST create no row and change no code or date; it
only writes the organization profile again and uploads the logo again, which
replaces the previous one.

#### Scenario: Second run

- GIVEN the demo dataset was seeded
- WHEN the demo seed runs again
- THEN no session, element or user is added and no "Seeded" line is logged

### Requirement: The Demo Seed Ships in the API Image

The demo seed entry MUST be compiled with the admin seed
(`tsconfig.seed.json`), so the production API image can run it with
`node dist/seed/src/shared/seeding/demo-seed.main.js`. Like the dev
dataset, which that image already carries since EN-93, its flag is what
keeps it from running; restoring dev-seed-data's "not in `dist`" goal is
EN-251.

#### Scenario: The compiled entry exists

- GIVEN the API image is built
- WHEN `dist/seed/src/shared/seeding/demo-seed.main.js` is looked up
- THEN it exists
