# Proposal: Dev Seed Data

## Intent

After the 2026-09-28 dev reset, the dev database holds only the admin, one
technician and a blank organization profile. Every browser check must first
build communities, templates, users and review sessions by hand, and the QA
users for three roles are gone. The technician account is also seeded
whenever `NODE_ENV` is not `production`, so staging would get a public
password.

Success: `prisma migrate reset` followed by `prisma db seed` (Prisma 7 does
not auto-seed after a reset) yields a dev database where every role's
Review history scope can be checked in the browser, and no non-development
environment receives dev credentials.

**Deliberately no web UI.** This is developer tooling, not a domain slice,
so the ADR-006 "domain + UI" rule does not apply.

Context: `[[sdd/dev-seed-data/explore]]`, ADR-006, ADR-013, ADR-016.

## Scope

### In Scope

1. A dev dataset seeded only when `NODE_ENV === 'development'`
   (allow-list). The technician account moves to the same gate. No
   tracked file sets `NODE_ENV` today, and the current gate treats unset
   as dev, so the local setup must supply `development` explicitly:
   `NODE_ENV=development` is set in the local `apps/api/.env`, and a new
   tracked `apps/api/.env.example` documents it (user decision, option (b):
   each environment declares itself; the seed script does not force it).
   When the gate skips the dev dataset, the seed logs a clear message that
   names the target database host (never credentials).
2. One fixed shared dev password, valid under `PlainPassword`, documented
   in `README.md`. Emails under `@sf-manager.example`: `technician@`,
   `rep@`, `companymgr@`, `manager@`, and more as needed.
3. Dataset: 2 maintenance companies; users for all 5 roles, including two
   `MANAGER`s (one with `VIEW_ALL_REVIEWS`, one without); 2 communities
   with asymmetric representative/technician assignments; 1–2
   extinguishers per community; 3–5 checklist questions; 1 active template
   (EXTINGUISHER × MONTHLY).
4. A few completed review sessions plus 1 draft, all timestamped "now".
5. Organization profile filled via `UpdateOrganizationProfile`, overwriting
   existing values.
6. Idempotent, additive seeding: a rerun creates no duplicates.
7. `README.md` reset section and `CLAUDE.md` dev-data bullet updated.

### Out of Scope

- Multiple templates, frequencies or versions; retired templates.
- Soft-deleted or deactivated fixtures; volume or random data.
- Backdated history.
- A wipe-and-reseed command (`migrate reset` covers it).
- Seeding any environment other than development.

## Capabilities

### New Capabilities

- `dev-seed-data`: the development gate, the seeded dataset and its
  credentials, and rerun idempotency.

### Modified Capabilities

None. The admin bootstrap, the migration-owned profile row and the
documented reset keep their current requirements.

## Approach

A separate dev-only dataset module runs after the unchanged admin
bootstrap in the same `prisma db seed` run. It uses application use cases
and repositories, so domain invariants hold. Existing records are found by
natural key (email, tax id, community name) and skipped. The design
decides the natural keys for templates and sessions, and the Actor used to
record and complete sessions.

## Affected Areas

| Area | Impact |
|---|---|
| `apps/api/prisma/seed.ts` | Modified: invokes the dev dataset |
| `apps/api/src/shared/seeding/**` | Modified gate; new dataset module and specs |
| `README.md`, `CLAUDE.md` | Modified: dev credentials, reset, dev data |
| `apps/api/.env.example` | New: documents `NODE_ENV=development` for local dev |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Rerun duplicates or fails on non-idempotent use cases | High | Skip-if-exists per natural key; run-twice test |
| A mid-seed failure leaves partial data | Med | Rerun fills the gaps; `migrate reset` as fallback |
| Seed drifts as the schema evolves | Med | Integration test against the hermetic per-run DB |
| Dev credentials reach a non-dev DB | Low | Allow-list gate with its own spec |
| Unset `NODE_ENV` silently skips the dev dataset (and now the technician) | High | Set in `apps/api/.env`, documented in new `apps/api/.env.example` and `README.md`; seed logs the skip |

## Rollback Plan

Revert the PRs. Seeded rows stay in local dev databases until the next
`migrate reset`. No schema changes are involved.

## Dependencies

- None beyond the existing use cases and the hermetic integration harness.

## Success Criteria

- [ ] After `migrate reset` then `db seed` with `NODE_ENV=development`, the technician,
      representative and company-manager scopes each show a non-empty
      subset that differs from the admin's full list; the granted `MANAGER`
      matches the admin; the ungranted `MANAGER` sees nothing.
- [ ] Running the seed twice leaves all row counts unchanged.
- [ ] With `NODE_ENV` unset, `test`, `staging` or `production`, no dev
      users or dataset are seeded; the admin still is.
- [ ] The dev password and accounts are documented in `README.md`.

## Delivery

Medium: roughly 400–700 changed lines, with tests a large share. The
design supersedes the 2-PR estimate (3 PRs, finalized at `sdd-tasks`),
`stacked-to-main`.
