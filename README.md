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
3. Start Postgres:
   ```
   docker compose up -d
   ```
4. Generate the Prisma client and push the (currently empty) schema:
   ```
   npm run prisma:generate -w apps/api
   npm run prisma:push -w apps/api
   ```
5. Run everything:
   ```
   npm run dev
   ```
   - API: http://localhost:3000 (Swagger docs at `/docs`, health check at `/health`)
   - Web: http://localhost:5173

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
