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
   ```
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
- `npm run test` — run every package's test suite.

## Structure

- `apps/api` — NestJS backend, Clean Architecture, module-first (ADR-002).
- `apps/web` — React + Vite + React Router (ADR-004/015).
- `packages/api-contracts` — shared API types (stub, ADR-014).
- `packages/validation` — shared Zod schemas (stub, ADR-015).

`apps/mobile` and `apps/desktop` don't exist yet — deferred until the web+API
walking skeleton is validated (ADR-006).
