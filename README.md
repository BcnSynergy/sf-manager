# SF-Manager

RIPCI extinguisher review management. Full architecture context lives in
[`docs/adr/INDEX.md`](docs/adr/INDEX.md) and
[`docs/architecture/domain-model-inspections.md`](docs/architecture/domain-model-inspections.md).

This is a walking-skeleton-stage scaffold (see `CLAUDE.md`) — no real
business features yet, just the toolchain wired end-to-end.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Create `apps/api/.env` (git-ignored, not committed) with:
   ```
   DATABASE_URL="postgresql://sfmanager:sfmanager@localhost:5432/sfmanager?schema=public"
   JWT_SECRET="<a long random string>"
   CORS_ORIGIN="http://localhost:5173"
   NODE_ENV=development
   ```
   `apps/api/.env.example` lists every variable the API reads; copy it as a
   starting point. `NODE_ENV=development` is what lets `prisma db seed`
   create the dev accounts below: with it unset (or any other value) the
   seed creates only the admin and logs that it skipped the rest, naming the
   target database host.
   On Windows PowerShell, avoid `Out-File -Encoding utf8` — it adds a BOM
   that breaks Prisma's env parsing (`DATABASE_URL` silently "not found").
   Use `-Encoding utf8NoBOM` (PowerShell 7+), or:
   ```powershell
   [System.IO.File]::WriteAllText("$PWD\apps\api\.env", 'DATABASE_URL="postgresql://sfmanager:sfmanager@localhost:5432/sfmanager?schema=public"' + "`n", [System.Text.UTF8Encoding]::new($false))
   ```
   If Docker Desktop is set to Windows containers, `docker compose up` will
   fail pulling `postgres:17-alpine` (Linux-only image). Switch with
   `docker desktop engine use linux` (or via the Docker Desktop tray icon).

   Auth-related env vars (`apps/api`):
   | Var | Required | Default | Notes |
   |-----|----------|---------|-------|
   | `JWT_SECRET` | Yes | — | App throws at boot without it. |
   | `CORS_ORIGIN` | Yes | — | The web origin allowed to send credentialed requests (e.g. `http://localhost:5173` in dev). App throws at boot without it. |
   | `JWT_EXPIRES_IN` | No | `2h` | Access token lifetime, e.g. `30m`, `2h`, `1d`. |
   | `SEED_ADMIN_EMAIL` | Only for seeding | — | Used by `prisma db seed` to create/update the admin user. |
   | `SEED_ADMIN_PASSWORD` | Only for seeding | — | Used by `prisma db seed` to create/update the admin user. |
   | `NODE_ENV` | For dev seed data | — | Must be exactly `development` for `prisma db seed` to create the dev accounts. |
3. Start Postgres:
   ```
   docker compose up -d
   ```
4. Generate the Prisma client, run the migration and seed an admin user:
   ```
   npm run prisma:generate -w apps/api
   npm exec -w apps/api -- prisma migrate dev
   npm exec -w apps/api -- prisma db seed
   ```
   The API doesn't yet expose a dedicated `prisma:migrate`/`prisma:seed`
   npm script (only `prisma:generate`/`prisma:push` exist in
   `apps/api/package.json`), so the Prisma CLI is invoked directly via
   `npm exec`. `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` must be set in
   `apps/api/.env` before running the seed step — that's the admin account
   you'll log in with.

   With `NODE_ENV=development` the seed also creates the dev accounts below.
   Every one of them shares one public, dev-only password:
   `sf-manager-dev-1`.

   | Account | Role |
   |---------|------|
   | `technician@sf-manager.example` | Maintenance technician (Dev Seed Fire Safety A) |
   | `technician2@sf-manager.example` | Maintenance technician (Dev Seed Fire Safety B) |
   | `companymgr@sf-manager.example` | Maintenance company manager (Dev Seed Fire Safety A) |
   | `rep@sf-manager.example` | Community representative |
   | `manager@sf-manager.example` | Manager with `VIEW_ALL_REVIEWS` |
   | `manager-nocap@sf-manager.example` | Manager without capabilities |

   Besides the accounts, the same seed creates two maintenance companies, two
   communities (`Dev Seed Residences North` and `Dev Seed Residences South`,
   two extinguishers each), the assignments for those accounts, three
   extinguisher questions, an active `Dev Seed Extinguisher Monthly Check`
   template, three completed review sessions and one draft session (recorded
   by `rep@`, 1 of 2 elements). It also overwrites the organization profile.
   Session timestamps are the moment of the run; nothing is backdated.

   The seed is additive and idempotent: rerunning it creates nothing that
   already exists. If an account already exists with a different role or
   company, the seed warns and leaves it alone; run `prisma migrate reset`
   then `prisma db seed` (see below) to get a clean one.
5. Run everything:
   ```
   npm run dev
   ```
   - API: http://localhost:3000 (Swagger docs at `/docs`, health check at `/health`)
   - Web: http://localhost:5173

   Everything beyond `/health` now requires being logged in as the seeded
   admin — open http://localhost:5173, you'll be redirected to `/login`.

## Other commands

- `npm run build` — build all apps/packages (Turborepo).
- `npm run lint` — lint everything, including the ADR-013 Prisma-boundary rule.
- `npm run test` — run every package's test suite (unit only; needs no database).
- `npm run test:integration -w apps/api` — run the API's real-database
  integration suite (`src/**/*.integration.spec.ts` plus
  `test/app.integration.spec.ts`). Each run gets its own freshly created and
  migrated database, named `sf_manager_test_<8-char timestamp>_<6-char
  random>` (the timestamp is embedded so stale runs can be aged out), on the
  docker-compose Postgres instance — never the dev database `sfmanager`. A
  run's database is dropped when it finishes; a database from a run that
  crashed before teardown is swept and dropped automatically by the next
  run once it is older than 24 hours. Runs are isolated from each other, so
  it's safe to run `test:integration` concurrently (e.g. in two terminals)
  or as a routine full-suite check — nothing here touches `sfmanager`.
- `npm run test:e2e -w apps/api` — the remaining `*.e2e-spec.ts` suite
  (stubbed dependencies, no database).

### One-time dev database reset

If the dev database (`sfmanager`) ever needs resetting to a clean seeded
state (for example after manually editing rows for a QA/demo session), run
once, from the repository root:

```
npm exec -w apps/api -- prisma migrate reset
npm exec -w apps/api -- prisma db seed
```

`prisma migrate reset` prompts before dropping and recreating `sfmanager`
(no `--force` is used here, deliberately, so it always asks); the reset
also restores the migration-defined foreign keys the dev volume may be
missing if it predates them. `prisma db seed` is idempotent, so it is safe
to run again even if the reset already seeded on its own. Afterwards the
database holds the seeded admin and, when `NODE_ENV=development` is set in
`apps/api/.env`, the dev dataset described above (accounts, companies,
communities, template and sessions). Without `NODE_ENV=development` only the
admin and the migration's default organization profile row exist. This reset is
manual and destructive to `sfmanager` — it is never run by
`test:integration` or any other automated command.

## Structure

- `apps/api` — NestJS backend, Clean Architecture, module-first (ADR-002).
- `apps/web` — React + Vite + React Router (ADR-004/015).
- `packages/api-contracts` — shared API types (stub, ADR-014).
- `packages/validation` — shared Zod schemas (stub, ADR-015).

`apps/mobile` and `apps/desktop` don't exist yet — deferred until the web+API
walking skeleton is validated (ADR-006).
