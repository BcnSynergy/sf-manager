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
   JWT_SECRET="<32+ random characters, e.g. openssl rand -hex 32>"
   THROTTLE_KEY_SECRET="<a different 32+ character random string>"
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

   | Var                                        | Required           | Default                                                                                  | Notes                                                                                                                                                                                                                                                                                                                                                         |
   | ------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `JWT_SECRET`                               | Yes                | —                                                                                        | At least 32 characters, no surrounding whitespace (`openssl rand -hex 32`). App throws at boot otherwise (EN-180).                                                                                                                                                                                                                                            |
   | `THROTTLE_KEY_SECRET`                      | Yes                | —                                                                                        | Keys the HMAC that the login and refresh rate-limit counters are stored and logged under, so the table and the logs never hold a hash anyone can recompute from an email or an IP (EN-6). Changing it resets every counter and active block. Same rules as `JWT_SECRET`, and it must differ from it; app throws at boot otherwise (EN-180).                   |
   | `CORS_ORIGIN`                              | Yes                | —                                                                                        | The web origin allowed to send credentialed requests (e.g. `http://localhost:5173` in dev). Must be an exact origin: lower case, no path, no trailing slash, no default port. App throws at boot when it is missing or malformed.                                                                                                                             |
   | `JWT_EXPIRES_IN`                           | No                 | `15m`                                                                                    | Access token lifetime, e.g. `15m`, `30m`, `2h`. Short because the web renews it silently with the refresh token (TD-5); the session itself lasts as long as the refresh token.                                                                                                                                                                                |
   | `REFRESH_TOKEN_IDLE_TTL`                   | No                 | `8h`                                                                                     | A refresh session not refreshed for this long ends (idle timeout). Same format as `JWT_EXPIRES_IN`; must be greater than zero, or the app throws at boot.                                                                                                                                                                                                     |
   | `REFRESH_TOKEN_ABSOLUTE_TTL`               | No                 | `7d`                                                                                     | A refresh session ends this long after its login, however often it is refreshed. Same format; must be greater than zero.                                                                                                                                                                                                                                      |
   | `REFRESH_TOKEN_REUSE_GRACE`                | No                 | `10s`                                                                                    | How long an already used refresh token is still honoured once (two tabs refreshing at the same time). Past it, presenting that token revokes the whole session. `0s` turns the grace off. The web gives up on a refresh after a fixed 9 s and assumes a grace of at least 10 s: below that, a slow refresh retried late can revoke the session (EN-173).      |
   | `REFRESH_TOKEN_COOKIE_PATH`                | No                 | `/auth`                                                                                  | Path of the refresh-token cookie, as the browser sees the auth routes. Must start with `/`. The production stack sets `/api/auth` (Caddy serves the API under `/api`).                                                                                                                                                                                        |
   | `REFRESH_RATE_LIMIT_MAX_ATTEMPTS`          | No                 | `60`                                                                                     | Refreshes allowed per client key within the window, counted apart from login attempts. Must be a positive integer.                                                                                                                                                                                                                                            |
   | `REFRESH_RATE_LIMIT_WINDOW_SECONDS`        | No                 | `60`                                                                                     | Length of the refresh rate-limit window, in seconds. Must be a positive integer.                                                                                                                                                                                                                                                                              |
   | `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`            | No                 | `10`                                                                                     | Login attempts allowed per client key (IPv4 address or IPv6 /64 prefix) within the window. Must be a positive integer; the app throws at boot otherwise.                                                                                                                                                                                                      |
   | `LOGIN_RATE_LIMIT_WINDOW_SECONDS`          | No                 | `900`                                                                                    | Length of the login rate-limit window, in seconds. Must be a positive integer.                                                                                                                                                                                                                                                                                |
   | `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES`      | No                 | `5`                                                                                      | Failed logins allowed per email before it is blocked. Failures are counted per normalized email (trimmed, lowercase) across all client keys, and a successful login resets the count. The attempt that reaches the limit is still answered `401`; the next one gets `429`. Must be a positive integer (at most 2147483647); the app throws at boot otherwise. |
   | `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS`    | No                 | `900`                                                                                    | Length of the per-email failure window and of the block that follows the limit, in seconds. Must be a positive integer (at most 86400); the app throws at boot otherwise.                                                                                                                                                                                     |
   | `PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS`   | No                 | `10`                                                                                     | Requests allowed per client key within the window on each password reset endpoint (request and confirm are counted apart). Must be a positive integer; the app throws at boot otherwise.                                                                                                                                                                      |
   | `PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS` | No                 | `900`                                                                                    | Length of the per-client-key password reset window and of the block that follows the limit, in seconds. Must be a positive integer (at most 86400).                                                                                                                                                                                                           |
   | `TRUST_PROXY`                              | No                 | off                                                                                      | How many trusted proxy hops sit between the client and the API, for the login rate limit's client IP. Accepted: unset, empty or `false` (off, use the socket address); `true` (one hop); a positive integer N (N hops). Any other value makes the app throw at boot. See the topology table below.                                                            |
   | `API_DOCS_ENABLED`                         | No                 | on outside production, off in production                                                 | Serves Swagger UI and the OpenAPI document at `/docs`. Accepted: unset or empty (the default), `true`, `false` (exact, lowercase). Any other value makes the app throw at boot.                                                                                                                                                                               |
   | `DEMO_MODE`                                | No                 | off                                                                                      | Marks the public demo: `GET /demo` then lists the demo accounts, and the web app shows the Demo banner and those accounts on its login page. Only the demo override sets it. Accepted: unset or empty (the default), `true`, `false` (exact, lowercase). Any other value makes the app throw at boot.                                                         |
   | `FILE_STORAGE_DIR`                         | Only in production | `storage` under the working directory outside production (`apps/api` with `npm run dev`) | Directory for uploaded files such as the organization logo. The app throws at boot in production without it; the API image sets it to `/var/lib/sf-manager/files`.                                                                                                                                                                                            |
   | `SMTP_HOST`                                | Only in production | `localhost` (port `1025`, the Mailpit catcher) outside production                        | SMTP relay for outgoing email (README "Email"). The app throws at boot in production without it.                                                                                                                                                                                                                                                              |
   | `SMTP_PORT`                                | No                 | `587` in production, `1025` outside it                                                   | Port `465` uses implicit TLS; any other port upgrades with STARTTLS, which production always requires, and any environment requires when credentials are set. Must be a positive integer up to 65535.                                                                                                                                                         |
   | `SMTP_USER`                                | Only in production | —                                                                                        | SMTP login. Set together with `SMTP_PASSWORD`, or neither outside production.                                                                                                                                                                                                                                                                                 |
   | `SMTP_PASSWORD`                            | Only in production | —                                                                                        | SMTP password or key, no surrounding whitespace.                                                                                                                                                                                                                                                                                                              |
   | `SMTP_FROM`                                | Only in production | `SF-Manager <no-reply@sf-manager.local>` outside production                              | Sender, e.g. `SF-Manager <no-reply@example.com>`; must contain an email address on a domain the relay has authenticated.                                                                                                                                                                                                                                      |
   | `SEED_ADMIN_EMAIL`                         | Only for seeding   | —                                                                                        | Used by `prisma db seed` to create/update the admin user.                                                                                                                                                                                                                                                                                                     |
   | `SEED_ADMIN_PASSWORD`                      | Only for seeding   | —                                                                                        | Used by `prisma db seed` to create/update the admin user.                                                                                                                                                                                                                                                                                                     |
   | `NODE_ENV`                                 | For dev seed data  | —                                                                                        | Must be exactly `development` for `prisma db seed` to create the dev accounts.                                                                                                                                                                                                                                                                                |

   `TRUST_PROXY` must match the real topology; a wrong value either lets a
   client choose its own rate-limit key (too high) or puts every client in one
   bucket (too low):

   | Topology                                           | `TRUST_PROXY`                                                                                                   |
   | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
   | No proxy (API reachable directly)                  | unset (off)                                                                                                     |
   | One reverse proxy (e.g. nginx) in front of the API | `true` (or `1`)                                                                                                 |
   | CDN plus a reverse proxy                           | `2`                                                                                                             |
   | Edge proxy plus the stack's Caddy (production)     | `2`                                                                                                             |
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

3. Start Postgres and Mailpit, which catches the email the API sends in
   development (open http://localhost:8025 to read it):
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

The API's test scripts run Jest under `node --experimental-vm-modules`:
NestJS 12 ships only ES modules, and Jest loads them from the CommonJS test
build through `require(esm)` only with that flag. To run `npx jest` directly
in `apps/api`, set `NODE_OPTIONS=--experimental-vm-modules` first. Each run
prints Node's "ExperimentalWarning: VM Modules is an experimental feature";
it is expected and not a failure.

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

### Demo dataset

The public demo's data (spec `demo-seed-data`) is a separate dataset with its
own entry, `apps/api/src/shared/seeding/demo-seed.main.ts`: the property
manager `Finques Mediterrània` with its logo, three maintenance companies,
six communities with twenty-four extinguishers, the extinguisher checklist
in Spanish (a quarterly and an annual template) and twelve review sessions
dated in the past. It runs only with `SEED_DEMO_DATA=true`; any other value
writes nothing and exits with an error. It seeds the admin from
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` too, never the dev dataset.

Seed it into an empty, migrated database, not `sfmanager` (it would mix with
the dev data), and give it its own file directory, since it stores the logo
and signatures. For example, with a scratch database on the docker-compose
Postgres, from the repository root:

```
docker compose exec -T postgres createdb -U sfmanager sfmanager_demo
export DATABASE_URL=postgresql://sfmanager:sfmanager@localhost:5432/sfmanager_demo
export FILE_STORAGE_DIR="$(mktemp -d)"
npm exec -w apps/api -- prisma migrate deploy
SEED_DEMO_DATA=true npm run seed:demo -w apps/api
```

Drop it afterwards with `docker compose exec -T postgres dropdb -U sfmanager
sfmanager_demo` and remove the `$FILE_STORAGE_DIR` directory.

The API image runs the compiled entry:
`node dist/seed/src/shared/seeding/demo-seed.main.js`.

Every demo account shares one public password: `sf-manager-demo-1`.

| Account                                                               | Role                                            |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `gestor@demo.sf-manager.example`                                      | Manager with `VIEW_ALL_REVIEWS`                 |
| `empresa1@`, `empresa2@`, `empresa3@demo.sf-manager.example`          | Maintenance company managers                    |
| `tecnico1a@`, `tecnico1b@demo.sf-manager.example`                     | Technicians of Extintores Llobregat             |
| `tecnico2@demo.sf-manager.example`                                    | Technician of ProtecFoc Serveis                 |
| `tecnico3@demo.sf-manager.example`                                    | Technician of Garraf Seguridad Contra Incendios |
| `presidente1@`, `presidente2@`, `presidente3@demo.sf-manager.example` | Community representatives, two communities each |

Each extinguisher keeps a fixed code (the one its QR label encodes), so a
printed sheet of the demo's labels stays valid: `DEM` + the community key
(`MA`, `JA`, `SE`, `PR`, `VD`, `TR`) + `EXT` + `22` to `26`, for example
`DEMMAEXT22`. Every technician and representative has a seeded signature, so
they can sign a review straight away.

## Continuous integration

Every pull request and every push to `main` runs the `ci` job
(`.github/workflows/ci.yml`) on Node 24: install, build, a check that no
test or seed helper reached the API build output, lint, format check,
ShellCheck, API typecheck, unit tests, API e2e tests, API integration tests,
the deploy script tests and the image smoke test (see "Images in CI"), in
that order. The integration tier runs against a throwaway Postgres service
container, and the `ci` job uses no secrets and a read-only token. Only the
`publish` job, which runs on `main` alone, gets write access to packages
(see "Images in CI").

Branch protection on `main` is applied once the `ci` check has run green
there (see ADR-017). From then on, the `ci` check is required for everyone,
including the admin (no bypass). Branches do not have to be up to date with `main` before
merging. A pull request is not required, but a direct push is only accepted
for a commit that already has a green `ci` run. Renaming the job breaks
merges until branch protection is updated. To roll back, remove branch
protection first, then revert the workflow; see
[ADR-017](docs/adr/ADR-017-ci-merge-barrier.md).

### Dependency updates

Dependabot (`.github/dependabot.yml`) checks every week and opens PRs;
none merges on its own.

- Base images (`node`, `caddy`, `postgres`): a new digest for the same tag,
  one PR per image (see "Production deployment"). The `rclone` image is
  pinned by full version, so it also gets minor and patch versions. Majors
  are ignored for all of them. CI's own Postgres service image is not
  covered (EN-107).
- npm (the whole workspace, from the root `package-lock.json`): minor and
  patch updates in one grouped PR, each major in its own PR.
  `@nestjs/throttler` is pinned to an exact version on purpose and excluded
  from the group, so every update to it arrives as its own PR (each upgrade
  must re-check the login e2e, TD-48). Prisma (`prisma`, `@prisma/*`) has its
  own grouped PR, because a Prisma minor can change the error metadata the
  repositories read (TD-49).
- GitHub Actions: workflows pin actions by major tag, so every update is a
  major; all of them arrive in one grouped PR.

Dependabot alerts and security updates are enabled in the repository
settings, not in `dependabot.yml`. When an advisory affects an npm package
or a GitHub Action, GitHub raises an alert, and when a patched version
exists Dependabot opens a security PR for it, outside the weekly schedule
and the groups above. The advisory database has no entries for Docker base
images, so those only get the weekly digest PRs.

## Production deployment

`docker-compose.prod.yml` runs the whole system on one server with Docker:
Postgres, the API, a backup service and an off-site copy service (below), and Caddy, which serves the web app and forwards `/api/*`
to the API on the same origin. It runs behind the edge proxy
(`deploy/edge/`), its own Compose project and the only service that
publishes ports (80 and 443): it obtains and renews the HTTPS certificate
for the site on its own, redirects plain HTTP to HTTPS and forwards each
request to the stack's Caddy over the `sf-edge` Docker network, so the
domain's DNS must point at the server and both ports must be open. The
stack's Caddy publishes no port. The server needs Docker Engine 25 or later
with the Compose plugin: the API's healthcheck uses `start_interval`. The
spec is `openspec/specs/deployment/spec.md`.

0. Start the edge proxy once, before the stack: the stack joins its network,
   so without it step 2 fails, saying the external network `sf-edge` could
   not be found. Its env file names the site and must match `SITE_ADDRESS`
   in `prod.env`:

   ```sh
   cp deploy/edge/edge.env.example deploy/edge/edge.env   # then set SFMANAGER_SITE
   docker compose -f deploy/edge/docker-compose.yml --env-file deploy/edge/edge.env up -d
   ```

   A deploy never restarts it. After `deploy/edge/` changes, recreate it
   with the same command plus `--force-recreate`: its Caddyfile is a mounted
   file, which a plain `up -d` neither notices nor reloads. To move a server that ran an older version,
   whose Caddy published the ports itself, see "Moving a server behind the
   edge proxy" below instead.

1. Create the env file from the example and fill in every value
   (`openssl rand -hex 32` gives a URL-safe password or secret):

   ```sh
   cp prod.env.example prod.env
   ```

   `prod.env` holds the secrets and is ignored by Git and by the Docker build
   context. `SITE_ADDRESS=localhost` (with `SFMANAGER_SITE=localhost` in
   `edge.env`) runs the stack on a developer machine with a certificate from
   Caddy's local authority, which the browser does not trust until you
   accept it.

2. Pin the images to the commit this checkout is on, pull them and start the
   stack:

   ```sh
   tag=sha-$(git rev-parse HEAD | cut -c1-7)
   grep -q '^IMAGE_TAG=' prod.env || printf '\nIMAGE_TAG=\n' >>prod.env
   sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" prod.env
   docker compose -f docker-compose.prod.yml --env-file prod.env pull api web &&
     docker compose -f docker-compose.prod.yml --env-file prod.env up -d --no-build
   ```

   CI publishes these images only for commits that were green on `main` (see
   "Images in CI"), so check out such a commit. A commit without published
   images fails the pull with `not found`, and so does an empty `IMAGE_TAG`
   (the error then names the `local` tag, which only images built from the
   checkout carry and CI never publishes). `--no-build` makes a missing image
   an error instead of a build on the server. The `grep` line adds
   `IMAGE_TAG` to a `prod.env` copied before it existed. Set `IMAGE_TAG` only
   in `prod.env`, never with `export`: a shell variable overrides the file,
   so this and every later command would use the shell's tag. CI names the
   tag with `git rev-parse --short=7`, which gives more than 7 characters
   only if the prefix is ambiguous in its checkout; if the pull then says
   `not found`, look up the tag in the package's version list. The server needs no
   registry login while the packages stay public. To
   build the images from the checkout instead, for example on a developer
   machine, leave `IMAGE_TAG` empty and run
   `docker compose -f docker-compose.prod.yml --env-file prod.env up -d --build`.

   The API applies pending migrations before it starts serving. If a
   migration fails the API container exits and restarts, and the old schema
   is never served; read why with
   `docker compose -f docker-compose.prod.yml --env-file prod.env logs api`.
   Caddy starts only once the API's healthcheck (`/health` answers 200)
   passes, so in that case `up -d` fails with
   `dependency failed to start: container ... api-1 is unhealthy`. When the
   upgrade replaced Caddy (a new `IMAGE_TAG` always does), the new Caddy is
   left created but not started, so the whole site is down (the edge proxy
   answers 502 after holding each request for 30 seconds); Docker does not
   start it later on its own, even once the API recovers, so after fixing
   the cause run `up -d` again. When Caddy was not replaced, the old one keeps
   running and answers 502 for `/api/*` until then. `docker compose ... ps` shows the
   API as `healthy` or `unhealthy`; an API that loses its database turns
   `unhealthy` within about a minute and a half; the production check
   (see "Monitoring") alerts once `/api/health` fails from outside.

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

4. To upgrade, check out the new version (`git fetch` and
   `git checkout <commit>`) and run step 2 again. To roll back, do the same
   with the previous commit; a rollback does not undo migrations the newer
   version applied.

   **Upgrading past the email change (ADR-018):** from that version on, the
   API refuses to start until `prod.env` has `SMTP_HOST`, `SMTP_USER`,
   `SMTP_PASSWORD` and `SMTP_FROM` (see "Email"). Add them before running
   step 2, or the API stays down and Caddy with it.

`TRUST_PROXY` is set to `2` in the compose file, because two proxies stand
in front of the API: the edge proxy, which replaces any `X-Forwarded-For` a
client sends with the client's address, and the stack's Caddy, which keeps
it and appends the edge proxy's address (it trusts that header from private
addresses only, and only Docker networks reach it). Put another proxy or a
CDN in front and the value must change (see the topology table above).

Caddy adds security headers (`apps/web/Caddyfile`), which the edge proxy
passes on: `nosniff` and a
referrer policy on every HTTPS response, HSTS unless `SITE_ADDRESS=localhost`, and a
Content Security Policy that allows only same-origin resources (plus `data:`
images and fonts) outside `/api/*`. Anything the web app loads from another
origin, or any inline script or style, needs the policy widened first.

The base images (`node`, `caddy`, `postgres`) are pinned by digest, so a
rebuild weeks later uses the same layers. Dependabot (`.github/dependabot.yml`)
checks weekly and opens a PR when a pinned tag gets a new digest, one PR per
image. A new major version (or a new Debian release for `node`) is a manual
upgrade. CI builds both images and starts the whole stack for every PR,
these included. For npm and GitHub Actions updates, see "Dependency
updates".

### Moving a server behind the edge proxy

A server that ran a version whose Caddy published ports 80 and 443 itself
moves once, with a short outage: from stopping the old Caddy until the new
API is healthy and its Caddy is up. The images are pulled beforehand, so
that is the API restart plus any migration, normally under a minute. Keep
the certificate: Caddy's data volume is copied into the edge proxy's, so no
new certificate is requested. From `~/sf-manager`, with the new commit
checked out (`git fetch` and `git checkout <commit>`) but the stack still
running the old one:

First the edge proxy's env file: its site is production's domain, taken
from `prod.env`. Check that the printed line names the real domain:

```sh
sed -n 's/^SITE_ADDRESS=/SFMANAGER_SITE=/p' prod.env >deploy/edge/edge.env &&
  grep -q '^SFMANAGER_SITE=.' deploy/edge/edge.env && cat deploy/edge/edge.env
```

Then the move itself, one chain, so any failing step stops it. Everything
before `stop web` only checks, downloads and copies: the edge proxy's image
(the copy uses the same image, pinned in `deploy/edge/docker-compose.yml`;
keep the two digests equal), the old certificates (`docker volume inspect`
makes sure the old volume exists, since `docker run -v` would quietly create
an empty one), and the stack's images, pinned as step 2 does (the `tag`,
`grep` and `sed` lines and the pull are step 2's, so its notes apply: a tag
CI did not publish fails the pull with `not found`). The outage starts at
`stop web`:

```sh
docker compose -f deploy/edge/docker-compose.yml --env-file deploy/edge/edge.env pull &&
  docker volume inspect sf-manager-prod_caddy-data >/dev/null &&
  docker volume create sf-edge_caddy-data &&
  docker run --rm -v sf-manager-prod_caddy-data:/from:ro -v sf-edge_caddy-data:/to \
    caddy:2-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0 \
    cp -a /from/. /to/ &&
  tag=sha-$(git rev-parse HEAD | cut -c1-7) &&
  { grep -q '^IMAGE_TAG=' prod.env || printf '\nIMAGE_TAG=\n' >>prod.env; } &&
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" prod.env &&
  docker compose -f docker-compose.prod.yml --env-file prod.env pull api web &&
  docker compose -f docker-compose.prod.yml --env-file prod.env stop web &&
  docker compose -f deploy/edge/docker-compose.yml --env-file deploy/edge/edge.env up -d &&
  docker compose -f docker-compose.prod.yml --env-file prod.env up -d --no-build
```

If a step after `stop web` fails, what to do depends on which one:

- The edge proxy's `up -d` failed: the stack's containers are still the old
  ones, so stop the edge proxy if it started (see the rollback below) and
  run `docker compose -f docker-compose.prod.yml --env-file prod.env start web`,
  which starts the old Caddy, ports included.
- The last `up -d` failed (for example a failed migration, see step 2): the
  old containers are already replaced by new ones whose Caddy publishes no
  port, so `start web` does not help. Leave the edge proxy running, fix the
  cause and run that last command again, or roll back as below.

Compose warns that `sf-edge_caddy-data` was not created by it; that is
expected, and it uses the volume. Check `https://<SITE_ADDRESS>/api/health`
and `sh deploy/check-production.sh https://<SITE_ADDRESS>`.

To roll back, stop the edge proxy (`stop`, not `down`: its network cannot
go while the stack's web container is attached to it), check out the
previous commit and run step 2, which pins `IMAGE_TAG` back to that commit.
Its Caddy publishes the ports again with its old data volume, which the
move left untouched. The Deploy workflow cannot do this rollback: it does
not stop the edge proxy, so the old Caddy could not bind the ports.

```sh
docker compose -f deploy/edge/docker-compose.yml --env-file deploy/edge/edge.env stop
git checkout <previous commit>   # then step 2
```

Once the new setup has run for a while, the old volumes can go:
`docker volume rm sf-manager-prod_caddy-data sf-manager-prod_caddy-config`.

### Demo stack

A public demo with fictitious data (spec `deployment`, "Demo stack"; the
dataset is spec `demo-seed-data` and README "Demo dataset") can run on the
same server, behind the same edge proxy, as its own Compose project
`sf-manager-demo`: `docker-compose.prod.yml` plus the override
`docker-compose.demo.yml`, with its own `demo.env`, database and uploaded
files. The override sets its project name itself, so a demo command typed
without `-p` still acts on the demo, never on production. Its web joins its
own edge network, `sf-edge-demo`, which the production web never shares; the
override sets that itself too, so it needs Docker Compose 2.24.4 or later
(`docker compose version`). The edge proxy
marks the demo `noindex`. The override sets `DEMO_MODE=true` on the demo's
API, so the web app shows a "Demo" banner and lists the demo accounts on its
login page (`GET /api/demo`; production answers `{"enabled":false}`). The
demo sends no email and keeps no backups. Its `reset` service drops the
database, migrates and seeds the demo dataset when the stack starts and
every night at `DEMO_RESET_HOUR_UTC` (UTC, default 3), and empties the
uploaded files. It runs from its own checkout, `~/sf-manager-demo`, next to
production's `~/sf-manager`: deploying one never moves the other's files,
and the reset script the demo mounts always matches the demo's images. A
production deploy (the Deploy workflow, `deploy/deploy.sh`) never touches
it; the same workflow deploys the demo with the target `demo` ("Deploying
from CI").

To start it on the server, with the edge proxy already running:

1. Point the demo's DNS name at the server, clone the demo's checkout from
   the public HTTPS URL (the deploy script fetches with it) and fill in
   `demo.env` with new secrets (none shared with production). Check out a
   commit whose images CI published, for example the one production runs,
   and set `IMAGE_TAG` to its tag (`sha-` plus the first 7 characters of its
   SHA):

   ```sh
   git clone https://github.com/BcnSynergy/sf-manager.git ~/sf-manager-demo
   cd ~/sf-manager-demo &&
     git checkout -q --detach "$(git -C ~/sf-manager rev-parse HEAD)" &&
     cp demo.env.example demo.env   # then fill it in, IMAGE_TAG included
   ```

2. From production's checkout, where the edge proxy's files live, tell the
   edge proxy the demo's domain, check the resulting configuration
   and recreate the edge proxy, which creates the `sf-edge-demo` network.
   Caddy validates the new configuration (the demo's domain is passed to that
   check only) before `edge.env` changes, so the chain stops without changing
   `edge.env` or the running edge proxy when the demo's domain is empty, equal
   to production's (Caddy would reject both sites), already set, or rejected
   by Caddy (the check itself creates the empty `sf-edge-demo` network, which
   the next attempt reuses). Production's site
   is down for the 10 to 15 seconds the edge proxy restarts; the production
   stack itself keeps running.

   ```sh
   cd ~/sf-manager
   demo_site=$(sed -n 's/^SITE_ADDRESS=//p' ~/sf-manager-demo/demo.env) &&
     prod_site=$(sed -n 's/^SFMANAGER_SITE=//p' deploy/edge/edge.env) &&
     [ -n "$demo_site" ] && [ "$demo_site" != "$prod_site" ] &&
     ! grep -q '^SFMANAGER_DEMO_SITE=' deploy/edge/edge.env &&
     docker compose -f deploy/edge/docker-compose.yml --env-file deploy/edge/edge.env \
       run --rm --no-deps -T -e SFMANAGER_DEMO_SITE="$demo_site" caddy \
       caddy validate --config /etc/caddy/Caddyfile &&
     printf '\nSFMANAGER_DEMO_SITE=%s\n' "$demo_site" >>deploy/edge/edge.env &&
     cat deploy/edge/edge.env &&
     docker compose -f deploy/edge/docker-compose.yml --env-file deploy/edge/edge.env up -d --force-recreate
   ```

3. From the demo's checkout, start the demo and watch its first reset seed
   it:

   ```sh
   cd ~/sf-manager-demo
   docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file demo.env pull api web &&
     docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file demo.env up -d --no-build
   docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file demo.env logs -f reset   # until "demo-reset: done"
   ```

4. Check it from outside: `curl -sI https://<demo domain>/` answers 200 with
   `X-Robots-Tag: noindex, nofollow`, and a demo account (README "Demo
   dataset") logs in.

To move the demo to another version, run the Deploy workflow with the target
`demo`, or by hand on the server `~/bin/sf-manager-deploy demo <commit SHA>`
(installed as in "Deploying from CI"): it checks out the commit in
`~/sf-manager-demo`, pins `IMAGE_TAG` in `demo.env` and restarts the demo,
whose reset then runs, so the demo starts over. The commands below run in
`~/sf-manager-demo`. To reset it now, inside the running reset container
(its lock lives there):

```sh
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file demo.env exec reset sh /usr/local/bin/demo-reset.sh once
```

To remove it, check that the project shown is `sf-manager-demo`, then take
it down with its volumes, drop `SFMANAGER_DEMO_SITE` from production's
`deploy/edge/edge.env` and recreate the edge proxy there (the last command
of step 2), and remove the demo's deploy key from `~/.ssh/authorized_keys`:

```sh
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file demo.env config | head -n 1   # name: sf-manager-demo
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file demo.env down -v
```

### Images in CI

CI builds the production images and runs `deploy/smoke-test.sh` on every PR
and push to `main`: it starts the edge proxy and the whole stack behind it
on `https://localhost` with throwaway secrets and fails unless
`/api/health` reports the database ok, Docker reports the API container
healthy, the web app answers 200 with its security headers, plain HTTP
redirects to HTTPS, a client that used up the login limit does not limit a
client from another address, the API can write uploaded files, the backup
service writes a dump and a files archive, the off-site copy service,
unconfigured, says it is disabled, the documented admin seed command
creates a system admin who can log in, and a dump taken before the newest
migration restores, with its uploaded files, and the API then applies that
migration. Run it locally from the repository root with
`sh deploy/smoke-test.sh` (ports 80 and 443 must be free and no edge proxy
may run on the machine; it uses its own Compose projects, keeps its backups
in a volume instead of `backups/`, and removes everything afterwards).

Before that, CI runs `shellcheck deploy/*.sh` and tests the backup and
off-site copy scripts against throwaway containers, with their own network
and volumes: `sh deploy/test-postgres-backup.sh` and
`sh deploy/test-offsite-copy.sh`, also from the repository root. Each
accepts a modified copy of its script as its argument, to see which case
catches a change. CI uses the runner's ShellCheck (0.9.0 on ubuntu-24.04),
which reports some findings newer versions do not, so check locally with
that version: `docker run --rm -i koalaman/shellcheck:v0.9.0 - < deploy/<script>.sh`.

When `main` is green, CI publishes `ghcr.io/bcnsynergy/sf-manager-api` and
`ghcr.io/bcnsynergy/sf-manager-web`, tagged `sha-<short commit SHA>`, and
moves their `main` tag while `main` still points at that commit. Each tag is
one image for `linux/amd64` and `linux/arm64`: the `publish-platform` jobs
build both on a native runner per platform, check them there and push them
by digest, and the `publish` job joins them under the tags (check with
`docker buildx imagetools inspect`). The packages are linked to this repository and inherit its access
permissions. After the first publish (#291) both were public (an anonymous
manifest fetch answered 200), although GitHub documents new packages as
private by default; why they came out public is unconfirmed. Pulls need no
token while they stay public; check or change that in each package's
Package settings. The server runs them through `IMAGE_TAG` (see
"Production deployment"), or the deploy workflow does (see "Deploying from
CI").

For monitoring see "Monitoring". Swagger is off at `/api/docs` unless
`prod.env` sets `API_DOCS_ENABLED=true`.

### Deploying from CI

The `Deploy` workflow (`.github/workflows/deploy.yml`, EN-185) runs step 4
of "Production deployment" for you. Start it from the Actions tab ("Run
workflow"), choosing the target (`production` by default, or `demo`; see
"Demo stack") and optionally the commit to deploy; empty deploys the current
`main`. It waits for your approval in the GitHub environment named after the
target, refuses
a commit that is not on `main` or has no published images, then deploys
over SSH and runs the site check of "Monitoring" (`deploy/check-production.sh`,
which only checks `/api/health` and the certificate, so it fits the demo
too) against that target's site. To roll back,
deploy an older commit of `main`; as with a manual rollback, migrations the
newer version applied stay. A commit from before the edge proxy (its Caddy
publishes the ports itself) cannot be deployed this way once the server
runs the edge proxy: roll back to it by hand, as "Moving a server behind
the edge proxy" describes. It never starts on its own: to deploy every
green `main` automatically, change its trigger.

The workflow and the server look for the images under the first 7
characters of the SHA. CI uses more only when 7 are ambiguous in its
checkout (see step 2 of "Production deployment"); a deploy of such a commit
then fails with the images "not published", and the commit has to be
deployed by hand with the tag from the package's version list.

If a run is cancelled or fails while it deploys, the server may be left
between steps. Check it with `git -C ~/sf-manager log --oneline -1`,
`grep IMAGE_TAG ~/sf-manager/prod.env` and `docker compose ... ps`, and deploy
again (the same or another commit) to bring all three in line.

On the server, the deploy key can only run `deploy/deploy.sh`: its
`authorized_keys` entry forces that script, which accepts nothing but a full
commit SHA of `main`. A copy lives outside the checkout, so checking out an
older commit cannot remove it. The script fetches `main` with the checkout's
own `origin` remote and no SSH agent, so that remote must be the public
HTTPS URL. One-time setup:

1. On your machine, create a key for this purpose only, without a
   passphrase. In Git Bash (Windows PowerShell 5.1 drops the empty `''`):
   `ssh-keygen -t ed25519 -N '' -C sf-manager-deploy -f sf-manager-deploy`.
2. On the server, install the script from `main` without moving the
   checkout, and add the public key (the one line in
   `sf-manager-deploy.pub`) with the forced command (`restrict` turns off
   forwarding and the terminal):

   ```sh
   mkdir -p ~/bin
   git -C ~/sf-manager fetch -q origin main &&
     git -C ~/sf-manager show origin/main:deploy/deploy.sh >~/bin/sf-manager-deploy.new &&
     chmod 755 ~/bin/sf-manager-deploy.new && mv ~/bin/sf-manager-deploy.new ~/bin/sf-manager-deploy
   pub='<contents of sf-manager-deploy.pub>'
   echo "restrict,command=\"$HOME/bin/sf-manager-deploy\" $pub" >>~/.ssh/authorized_keys
   ```

   Run the commands above the `pub=` line again whenever `deploy/deploy.sh`
   changes. They write a new file and move it into place only once `git show`
   succeeds: an empty script would exit 0, and the workflow would report a
   deploy that never ran.

3. In the repository's Settings > Environments, create `production`, add
   yourself as a required reviewer, limit "Deployment branches and tags" to
   the `main` branch (otherwise a workflow file changed on another branch
   could run with the secrets once approved), and add these environment
   secrets:
   - `DEPLOY_SSH_KEY`: the private key file `sf-manager-deploy`.
   - `DEPLOY_SSH_TARGET`: `ubuntu@<server address>`.
   - `DEPLOY_SSH_KNOWN_HOSTS`: the server's host key as a `known_hosts`
     line, taken from the server itself rather than from the network:
     `echo "<server address> $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"`.

   Then delete the private key from your machine.

To deploy the demo from CI too (demo-instance T3), give it a key and an
environment of its own, once the demo runs from `~/sf-manager-demo` ("Demo
stack"). Its key's forced command passes `demo`, so the script deploys the
demo's checkout with `demo.env`, and that key can never deploy production
(nor production's the demo: the client can only send a commit SHA):

1. Create a second key, `sf-manager-deploy-demo`, as in step 1.
2. On the server, first reinstall the script from `main` (the commands
   above the `pub=` line in step 2) and check that it knows the demo target:
   a script that does not (it has no `SFM_DEMO_DIR`, the demo checkout's
   setting) ignores the forced command's `demo`, so the demo's key would
   deploy production. Only then add the public key with the demo's forced
   command; the chain stops, and says why, when the check fails:

   ```sh
   if grep -q SFM_DEMO_DIR ~/bin/sf-manager-deploy; then
     pub='<contents of sf-manager-deploy-demo.pub>'
     echo "restrict,command=\"$HOME/bin/sf-manager-deploy demo\" $pub" >>~/.ssh/authorized_keys
   else
     echo 'the installed deploy script does not know the demo target: reinstall it first' >&2
   fi
   ```

3. Create the `demo` environment as in step 3 (required reviewer, `main`
   only), with the same three secrets, `DEPLOY_SSH_KEY` holding the demo's
   private key. Then delete that key from your machine.

A demo deploy to a new version restarts the demo's reset service with the
new image, so the demo also starts over. Deploying the version the demo
already runs, with `demo.env` unchanged, recreates no container, so
nothing resets; to reset it, run `demo-reset.sh once` as in "Demo stack".
If one stops between steps, check
`git -C ~/sf-manager-demo log --oneline -1` and `grep IMAGE_TAG
~/sf-manager-demo/demo.env` and deploy again.

### Monitoring

The production site is `https://sfmanager.bcnsynergy.com`. The `Production
check` workflow (`.github/workflows/production-check.yml`) runs
`deploy/check-production.sh` against it every 15 minutes, and on demand from
the Actions tab (Run workflow). The check fails when `/api/health` does not
answer 200 with `"status":"ok"` and `"db":"ok"` over trusted HTTPS, on each
of three tries 20 seconds apart, or when the certificate expires within 14
days. Caddy renews a 90-day certificate about 30 days before it expires, so
the second only fires when renewal has been failing for over two weeks.
Run it by hand from any machine with `curl` and `openssl`:

```sh
sh deploy/check-production.sh https://sfmanager.bcnsynergy.com
```

A failed run is the alert: GitHub emails it to whoever created the workflow,
or later changed its `cron` line or re-enabled it (your GitHub Settings >
Notifications > Actions controls that email). Know its limits:

- GitHub may start a scheduled run late, so an outage can take longer than
  15 minutes to show up.
- In a public repository GitHub disables the schedule after 60 days without
  activity in it; re-enable it from the Actions tab, and check now and then
  that recent runs exist.
- Each failed run sends its own email, so an outage repeats every quarter
  of an hour until the site recovers.
- To move the site to another domain, change the URL in the workflow.

CI tests the script against a fake site on every PR:
`sh deploy/test-check-production.sh`, from the repository root (needs
Docker only).

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
fix the cause and restore again. If the archive cannot be extracted, for
example because the disk is full, the database is restored but the
uploaded files are left as they were: fix the cause and restore again. The
archive is extracted next to the current files before it replaces them, so
the disk needs room for both while the restore runs.

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
3. Fill in the `OFFSITE_*` values, including `OFFSITE_S3_REGION` (the
   bucket's region) for any provider other than Cloudflare R2, and restart
   the stack (step 2 of "Production deployment").
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

Uploaded files (the organization logo and review photos) live in the
`api-files` named volume, mounted at `FILE_STORAGE_DIR`
(`/var/lib/sf-manager/files`).
The `backup` service archives them with each dump (see "Database backups"),
because a dump records which logo is current, not the image itself. The
archive is taken a moment after the dump, so a logo changed in between can
be missing after a restore; the profile and the documents then show no logo
until it is uploaded again.

The API deletes review photo files on its own (EN-222): a few minutes after
it starts, then every 24 hours, it removes files under `review-photos/` that
no photo row references and that are more than an hour old, and logs how
many. It deletes nothing while the database has no photo row at all, and
logs a warning instead. Still, always run the API on the database restored
together with the files: on a database with some photos but not these, the
files it does not know are deleted.

### Email

The API sends email (password reset links) through any SMTP relay,
configured with the `SMTP_*` values in `prod.env` (ADR-018). Production uses
Brevo's free plan (300 emails a day): host `smtp-relay.brevo.com`, port
`587`, and the SMTP login and key from Brevo's "SMTP & API" page. The API
refuses to start until `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and
`SMTP_FROM` are set; it opens no connection until it sends something, so a
wrong key or an unreachable relay shows up as a failed send in
`docker compose ... logs api`, not at start.

The sender's domain must be authenticated at the relay, or recipients
reject the mail: `bcnsynergy.com` publishes Brevo's verification TXT and its
two DKIM CNAMEs (`brevo1._domainkey`, `brevo2._domainkey`). With the
domain's strict DMARC (`p=reject; adkim=s; aspf=s`) only DKIM aligns, so
those two records are required; the SPF record does not list Brevo. Reset
links carry a single-use token and should reach the user unchanged, but
Brevo applies click tracking, rewriting links through its own redirector,
and offers no per-message switch to turn it off, so the token passes
through Brevo. This is accepted for now and tracked as TD-53; asking Brevo
support to disable it, or switching relays, fixes it.

To switch relays, change the `SMTP_*` values, authenticate the domain at
the new relay, and restart the API; no code changes. Brevo's SMTP key
expires (one year when it was created); renew it before then.

## Structure

- `apps/api` — NestJS backend, Clean Architecture, module-first (ADR-002).
- `apps/web` — React + Vite + React Router (ADR-004/015).
- `packages/api-contracts` — shared API types (stub, ADR-014).
- `packages/validation` — shared Zod schemas (stub, ADR-015).

`apps/mobile` and `apps/desktop` don't exist yet — deferred until the web+API
walking skeleton is validated (ADR-006).

## License

SF-Manager is dual-licensed under the
[GNU Affero General Public License v3.0 only](LICENSE) or a commercial
license. See [LICENSING.md](LICENSING.md) for details.
