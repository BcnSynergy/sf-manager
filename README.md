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
   fail pulling `postgres:18-alpine` (Linux-only image). Switch with
   `docker desktop engine use linux` (or via the Docker Desktop tray icon).

   Auth-related env vars (`apps/api`):

   | Var                                     | Required           | Default                                                                                  | Notes                                                                                                                                                                                                                                                                                                                                                         |
   | --------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `JWT_SECRET`                            | Yes                | —                                                                                        | App throws at boot without it.                                                                                                                                                                                                                                                                                                                                |
   | `CORS_ORIGIN`                           | Yes                | —                                                                                        | The web origin allowed to send credentialed requests (e.g. `http://localhost:5173` in dev). App throws at boot without it.                                                                                                                                                                                                                                    |
   | `JWT_EXPIRES_IN`                        | No                 | `2h`                                                                                     | Access token lifetime, e.g. `30m`, `2h`, `1d`.                                                                                                                                                                                                                                                                                                                |
   | `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`         | No                 | `10`                                                                                     | Login attempts allowed per client key (IPv4 address or IPv6 /64 prefix) within the window. Must be a positive integer; the app throws at boot otherwise.                                                                                                                                                                                                      |
   | `LOGIN_RATE_LIMIT_WINDOW_SECONDS`       | No                 | `900`                                                                                    | Length of the login rate-limit window, in seconds. Must be a positive integer.                                                                                                                                                                                                                                                                                |
   | `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES`   | No                 | `5`                                                                                      | Failed logins allowed per email before it is blocked. Failures are counted per normalized email (trimmed, lowercase) across all client keys, and a successful login resets the count. The attempt that reaches the limit is still answered `401`; the next one gets `429`. Must be a positive integer (at most 2147483647); the app throws at boot otherwise. |
   | `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` | No                 | `900`                                                                                    | Length of the per-email failure window and of the block that follows the limit, in seconds. Must be a positive integer (at most 86400); the app throws at boot otherwise.                                                                                                                                                                                     |
   | `TRUST_PROXY`                           | No                 | off                                                                                      | How many trusted proxy hops sit between the client and the API, for the login rate limit's client IP. Accepted: unset, empty or `false` (off, use the socket address); `true` (one hop); a positive integer N (N hops). Any other value makes the app throw at boot. See the topology table below.                                                            |
   | `API_DOCS_ENABLED`                      | No                 | on outside production, off in production                                                 | Serves Swagger UI and the OpenAPI document at `/docs`. Accepted: unset or empty (the default), `true`, `false` (exact, lowercase). Any other value makes the app throw at boot.                                                                                                                                                                               |
   | `FILE_STORAGE_DIR`                      | Only in production | `storage` under the working directory outside production (`apps/api` with `npm run dev`) | Directory for uploaded files such as the organization logo. The app throws at boot in production without it; the API image sets it to `/var/lib/sf-manager/files`.                                                                                                                                                                                            |
   | `SEED_ADMIN_EMAIL`                      | Only for seeding   | —                                                                                        | Used by `prisma db seed` to create/update the admin user.                                                                                                                                                                                                                                                                                                     |
   | `SEED_ADMIN_PASSWORD`                   | Only for seeding   | —                                                                                        | Used by `prisma db seed` to create/update the admin user.                                                                                                                                                                                                                                                                                                     |
   | `NODE_ENV`                              | For dev seed data  | —                                                                                        | Must be exactly `development` for `prisma db seed` to create the dev accounts.                                                                                                                                                                                                                                                                                |

   `TRUST_PROXY` must match the real topology; a wrong value either lets a
   client choose its own rate-limit key (too high) or puts every client in one
   bucket (too low):

   | Topology                                           | `TRUST_PROXY`                                                                                                   |
   | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
   | No proxy (API reachable directly)                  | unset (off)                                                                                                     |
   | One reverse proxy (e.g. nginx) in front of the API | `true` (or `1`)                                                                                                 |
   | CDN plus a reverse proxy                           | `2`                                                                                                             |
   | PaaS (e.g. Vercel)                                 | Confirm the platform's documented number of forwarding hops before setting any value; this README asserts none. |

   IPv6 clients are limited per `/64` prefix, and an IPv4-mapped IPv6 address
   (`::ffff:a.b.c.d`) counts as the IPv4 address.

   Login attempt counters are persisted in Postgres (table `ThrottleCounter`,
   keyed by a hash of the client key, no raw IP). They survive API restarts and
   are shared by every API instance, at the cost of one extra database
   statement per login attempt; an attempt that is already blocked only locks
   the row and does not rewrite it. Expired rows are cleaned up in small
   batches under a 500 ms statement timeout. If the counter write fails, the
   login attempt is refused. The window is fixed, so up to about twice the
   limit can pass around a window boundary.

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

   | Account                            | Role                                                 |
   | ---------------------------------- | ---------------------------------------------------- |
   | `technician@sf-manager.example`    | Maintenance technician (Dev Seed Fire Safety A)      |
   | `technician2@sf-manager.example`   | Maintenance technician (Dev Seed Fire Safety B)      |
   | `companymgr@sf-manager.example`    | Maintenance company manager (Dev Seed Fire Safety A) |
   | `rep@sf-manager.example`           | Community representative                             |
   | `manager@sf-manager.example`       | Manager with `VIEW_ALL_REVIEWS`                      |
   | `manager-nocap@sf-manager.example` | Manager without capabilities                         |

   Besides the accounts, the same seed creates two maintenance companies, two
   communities (`Dev Seed Residences North` and `Dev Seed Residences South`,
   two extinguishers each), the assignments for those accounts, three
   extinguisher questions, an active `Dev Seed Extinguisher Quarterly Check`
   template and an active `Dev Seed Extinguisher Annual Check` template, four
   completed review sessions (three Quarterly, one Annual, the Annual one in
   North) and one draft session (recorded by `rep@`, 1 of 2 elements). It also
   overwrites the organization profile.
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
  It only reports; `npm run lint:fix -w apps/api` applies the API's auto-fixes.
- `npm run format` — format the repo with Prettier; `npm run format:check`
  only reports (CI runs it).
  Formatting-only commits are listed in `.git-blame-ignore-revs`; run
  `git config blame.ignoreRevsFile .git-blame-ignore-revs` once to skip them
  in `git blame`.
- `npm run typecheck -w apps/api` — type-check the API including its specs,
  which `nest build` excludes and Jest does not type-check.
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

## Continuous integration

Every pull request and every push to `main` runs the `ci` job
(`.github/workflows/ci.yml`) on Node 24: install, build, lint, format
check, API typecheck, unit tests, API e2e tests and API integration tests,
in that order. The integration
tier runs against a throwaway Postgres service container, and the workflow
uses no secrets and a read-only token.

Branch protection on `main` is applied once the `ci` check has run green
there (see ADR-017). From then on, the `ci` check is required for everyone,
including the admin (no bypass). Branches do not have to be up to date with `main` before
merging. A pull request is not required, but a direct push is only accepted
for a commit that already has a green `ci` run. Renaming the job breaks
merges until branch protection is updated. To roll back, remove branch
protection first, then revert the workflow; see
[ADR-017](docs/adr/ADR-017-ci-merge-barrier.md).

## Production deployment

`docker-compose.prod.yml` runs the whole system on one server with Docker:
Postgres, the API, a backup service and an off-site copy service (below), and Caddy, which serves the web app and forwards `/api/*`
to the API on the same origin. Only Caddy publishes ports (80 and 443); it
obtains and renews the HTTPS certificate for `SITE_ADDRESS` on its own, so
the domain's DNS must point at the server and both ports must be open. The
spec is `openspec/specs/deployment/spec.md`.

1. Create the env file from the example and fill in every value
   (`openssl rand -hex 32` gives a URL-safe password or secret):

   ```sh
   cp prod.env.example prod.env
   ```

   `prod.env` holds the secrets and is ignored by Git and by the Docker build
   context. `SITE_ADDRESS=localhost` runs the stack on a developer machine
   with a certificate from Caddy's local authority, which the browser does
   not trust until you accept it.

2. Build and start the stack:

   ```sh
   docker compose -f docker-compose.prod.yml --env-file prod.env up -d --build
   ```

   The API applies pending migrations before it starts serving. If a
   migration fails the API container exits and restarts, and the old schema
   is never served; read why with
   `docker compose -f docker-compose.prod.yml --env-file prod.env logs api`.

3. Create the first admin once. The credentials come from your shell, so they
   are not stored in `prod.env` or in the running API:

   ```bash
   export SEED_ADMIN_EMAIL=admin@your-domain.example
   read -rs SEED_ADMIN_PASSWORD && export SEED_ADMIN_PASSWORD
   docker compose -f docker-compose.prod.yml --env-file prod.env \
     run --rm -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD api npx prisma db seed
   unset SEED_ADMIN_PASSWORD
   ```

   The image runs with `NODE_ENV=production`, so the seed creates only the
   admin, never the dev accounts. Running it again resets that admin's
   password.

4. To upgrade, check out the new version and run step 2 again.

`TRUST_PROXY` is set to `1` in the compose file, because Caddy is the only
proxy in front of the API and it replaces any `X-Forwarded-For` a client
sends. Put another proxy or a CDN in front and the value must change (see
the topology table above).

Caddy adds security headers (`apps/web/Caddyfile`): `nosniff` and a
referrer policy on every HTTPS response, HSTS unless `SITE_ADDRESS=localhost`, and a
Content Security Policy that allows only same-origin resources (plus `data:`
images and fonts) outside `/api/*`. Anything the web app loads from another
origin, or any inline script or style, needs the policy widened first.

The base images (`node`, `caddy`, `postgres`) are pinned by digest, so a
rebuild weeks later uses the same layers. Dependabot (`.github/dependabot.yml`)
checks weekly and opens a PR when a pinned tag gets a new digest, one PR per
image. A new major version (or a new Debian release for `node`) is a manual
upgrade. CI builds both images and starts the whole stack for every PR,
these included.

### Images in CI

CI builds the production images and runs `deploy/smoke-test.sh` on every PR
and push to `main`: it starts the whole stack on `https://localhost` with
throwaway secrets and fails unless `/api/health` reports the database ok,
the web app answers 200, the API can write uploaded files and the backup
service writes a dump. Run it locally
from the repository root with `sh deploy/smoke-test.sh` (ports 80 and 443
must be free; it uses its own Compose project and removes it afterwards).

When `main` is green, the `publish` job pushes `ghcr.io/bcnsynergy/sf-manager-api`
and `ghcr.io/bcnsynergy/sf-manager-web`, tagged `sha-<short commit SHA>`, and
moves their `main` tag while `main` still points at that commit. The packages are linked to this repository and inherit its access
permissions. After the first publish (#291) both were public (an anonymous
manifest fetch answered 200), although GitHub documents new packages as
private by default; why they came out public is unconfirmed. Pulls need no
token while they stay public; check or change that in each package's
Package settings. The server does not use them yet: it
still builds with `up -d --build`, and deploying from the registry is EN-91.

Monitoring and automated deploys are not part of this setup yet (EN-91,
EN-92). Swagger is off at `/api/docs` unless `prod.env` sets
`API_DOCS_ENABLED=true`.

### Database backups

The `backup` service dumps the database with `pg_dump` when the stack starts
and every 24 hours after that, into `backups/` next to the compose file
(`sfmanager-<UTC timestamp>.dump`, custom format). Right after each dump it
archives the uploaded files (see below) as
`sfmanager-<same timestamp>.files.tar.gz`. It deletes dumps and archives
older than `BACKUP_RETENTION_DAYS` (default 14), and `backups/` is ignored by
Git and by the Docker build context. Read what it did with
`docker compose -f docker-compose.prod.yml --env-file prod.env logs backup`.

These backups live on the same server as the database, so **they do not
survive losing the server**. Turn on the off-site copies (below), or copy
`backups/` somewhere else yourself on a schedule, for example with `rsync`
from root's cron or the provider's server snapshots. The dumps hold
password hashes and personal data, so they and the archives are readable by
root only.

If `BACKUP_RETENTION_DAYS` is not a positive integer without a leading zero,
the service fails at start and restarts in a loop; `logs backup` shows the
error.

Take a dump now:

```sh
docker compose -f docker-compose.prod.yml --env-file prod.env \
  run --rm backup once
```

Restore one. This replaces everything in the database with the dump, and
the uploaded files with the archive of the same timestamp, so stop the API
first and start it again afterwards; it applies any migrations newer than
the dump. A dump without an archive (taken before files were archived, or
whose archiving failed, which the `backup` logs report) restores the
database only and leaves the files as they are. A file that is not a dump,
such as an archive, or an archive that cannot be read stops the restore
before anything changes. If the
database restore fails, the database is left empty: do not start the API,
fix the cause and restore again.

```sh
docker compose -f docker-compose.prod.yml --env-file prod.env stop api
docker compose -f docker-compose.prod.yml --env-file prod.env \
  run --rm backup restore sfmanager-<timestamp>.dump
docker compose -f docker-compose.prod.yml --env-file prod.env start api
```

On a new server, put the dumps and archives in `backups/`, run only the
restore command (it starts Postgres but not the API or the daily backups),
then build and start the stack (step 2 of the list above). Skip step 3: the
dump already holds the admin. Starting the whole stack first would back up
the empty database and could delete copied dumps and archives older than the
retention period.

### Off-site copies

The `offsite` service copies `backups/` to an S3-compatible bucket at
another provider, so the backups survive losing the server. Cloudflare R2,
Backblaze B2, Wasabi, AWS S3 and a MinIO on another machine all work. It is
off until you set all five `OFFSITE_*` values in `prod.env` (see
`prod.env.example`); with only some of them set it fails at start and names
the missing ones.

Once on, it copies every dump and files archive not yet in the bucket when
the stack starts and every hour after that. The contents are encrypted with
`OFFSITE_ENCRYPTION_PASSWORD` before they leave the server; file names stay
readable (they are only timestamps) and get a `.bin` suffix, for example
`sfmanager-<timestamp>.dump.bin`. **Without that password the copies
cannot be restored**, so keep it in a password manager or anywhere other
than this server.

The service only adds files: a backup already in the bucket is never
uploaded again, even if the local file is later damaged or encrypted by
ransomware, and it never deletes anything in the bucket. The access key,
however, can usually delete too, so someone who takes over this server
could use it to remove the copies. Turn on versioning or object lock on
the bucket if your provider offers it to guard against that.

1. Create the bucket at the provider, and an access key that can read and
   write only that bucket. The service never creates buckets.
2. Add a lifecycle rule to the bucket that deletes objects after the number
   of days you want to keep, for example 90; without one they are kept
   forever.
3. Fill in the `OFFSITE_*` values and restart the stack (step 2 above).
   Check it with
   `docker compose -f docker-compose.prod.yml --env-file prod.env logs offsite`.

Copy now:

```sh
docker compose -f docker-compose.prod.yml --env-file prod.env \
  run --rm offsite once
```

To restore on a new server, fill in the same `OFFSITE_*` values, download
the copies into `backups/`, then follow the restore steps above:

```sh
docker compose -f docker-compose.prod.yml --env-file prod.env \
  run --rm offsite pull
```

A wrong password makes the download fail without writing any file.

### Uploaded files

Uploaded files, for now only the organization logo, live in the `api-files`
named volume, mounted at `FILE_STORAGE_DIR` (`/var/lib/sf-manager/files`).
The `backup` service archives them with each dump (see "Database backups"),
because a dump records which logo is current, not the image itself. The
archive is taken a moment after the dump, so a logo changed in between can
be missing after a restore; the profile and the documents then show no logo
until it is uploaded again.

## Structure

- `apps/api` — NestJS backend, Clean Architecture, module-first (ADR-002).
- `apps/web` — React + Vite + React Router (ADR-004/015).
- `packages/api-contracts` — shared API types (stub, ADR-014).
- `packages/validation` — shared Zod schemas (stub, ADR-015).

`apps/mobile` and `apps/desktop` don't exist yet — deferred until the web+API
walking skeleton is validated (ADR-006).
