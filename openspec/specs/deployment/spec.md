# Deployment Specification

## Purpose

Defines how SF-Manager runs in production: one Docker Compose stack on a single server, with Postgres, the API, and Caddy as the only public entry point for both the web app and the API.

## Requirements

### Requirement: One-command production stack

The repository MUST provide `docker-compose.prod.yml`, which builds the API and web images from the repository and starts Postgres, the API, the backup service, the off-site copy service and Caddy with one `docker compose ... up -d --build` command. Its Compose project name MUST differ from the dev stack's, so both can run on one machine.

#### Scenario: First start

- GIVEN a server with Docker and a filled-in `prod.env`
- WHEN the operator runs `docker compose -f docker-compose.prod.yml --env-file prod.env up -d --build`
- THEN Postgres, the API, the backup service, the off-site copy service and Caddy are running
- AND `https://<SITE_ADDRESS>/api/health` returns 200 with `{"status":"ok","db":"ok"}`

#### Scenario: Missing configuration

- GIVEN `prod.env` lacks a required value (`SITE_ADDRESS`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` or `JWT_SECRET`)
- WHEN the operator starts the stack
- THEN Compose refuses to start it and names the missing variable

### Requirement: Migrations before serving

The API container MUST apply pending Prisma migrations (`prisma migrate deploy`) before the API accepts requests. If migrating fails, the API MUST NOT start serving.

#### Scenario: Pending migrations

- GIVEN a database without the latest migrations
- WHEN the API container starts
- THEN every pending migration is applied
- AND the API then serves requests

#### Scenario: Migration failure

- GIVEN the API container cannot migrate the database (for example, wrong credentials)
- WHEN it starts
- THEN the container exits with a non-zero status without serving requests

### Requirement: First admin

The operator MUST be able to create or reset the system admin inside the production stack with one documented command that reads `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from the operator's shell. The production image runs with `NODE_ENV=production`, so this command MUST NOT create the dev seed accounts or dataset. The long-running API container SHALL NOT receive the seed credentials.

#### Scenario: Admin created

- GIVEN a running production stack with an empty user table
- WHEN the operator runs the documented seed command with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` exported
- THEN exactly one user exists, with that email and role `SYSTEM_ADMIN`
- AND that user can log in through `https://<SITE_ADDRESS>`

#### Scenario: Seed credentials stay out of the API

- GIVEN the production stack is running
- WHEN the API container's environment is inspected
- THEN it holds no `SEED_ADMIN_EMAIL` or `SEED_ADMIN_PASSWORD`

### Requirement: Single public origin

Caddy MUST serve the built web app and forward `/api/*` to the API with the `/api` prefix removed, on the same origin. The web app MUST be built to call the API at `/api`. A path with no matching file MUST return the web app's `index.html`. Only Caddy SHALL publish host ports (80 and 443); Postgres and the API MUST NOT.

#### Scenario: API through the proxy

- GIVEN the production stack is running
- WHEN a client requests `https://<SITE_ADDRESS>/api/health`
- THEN the API answers its `/health` route

#### Scenario: Client-side route

- GIVEN the production stack is running
- WHEN a browser opens `https://<SITE_ADDRESS>/review-sessions/<id>` directly
- THEN Caddy returns the web app's `index.html` with status 200

#### Scenario: Session cookie on the shared origin

- GIVEN the production stack is running
- WHEN a user logs in through `https://<SITE_ADDRESS>/api/auth/login`
- THEN the access-token cookie is `HttpOnly`, `Secure` and `SameSite=Strict`
- AND the following `/api/auth/me` request on the same origin is authenticated

### Requirement: HTTPS

Caddy MUST obtain and renew the HTTPS certificate for `SITE_ADDRESS` itself and MUST redirect plain HTTP to HTTPS. Its certificate data MUST persist in a named volume.

#### Scenario: Plain HTTP

- GIVEN the production stack is running
- WHEN a client requests `http://<SITE_ADDRESS>/`
- THEN Caddy redirects it to `https://<SITE_ADDRESS>/`

### Requirement: Security headers

Every HTTPS response from Caddy MUST carry `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. When `SITE_ADDRESS` is not `localhost`, every HTTPS response MUST also carry `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains` or `preload`; on `localhost` it MUST NOT, so the browser keeps allowing plain HTTP for other localhost ports. Every response outside `/api/*` MUST carry the Content Security Policy `default-src 'self'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, and the web app MUST work under it without the browser reporting a violation.

#### Scenario: Web app response

- GIVEN the production stack is running on a public domain
- WHEN a client requests `https://<SITE_ADDRESS>/` or any client-side route
- THEN the response carries all four headers: the CSP, HSTS, `nosniff` and the referrer policy

#### Scenario: API response

- GIVEN the production stack is running on a public domain
- WHEN a client requests `https://<SITE_ADDRESS>/api/health`
- THEN the response carries HSTS, `nosniff` and the referrer policy, but no Content Security Policy

#### Scenario: Local stack

- GIVEN the production stack is running with `SITE_ADDRESS=localhost`
- WHEN a client requests `https://localhost/`
- THEN the response carries no `Strict-Transport-Security` header

#### Scenario: No violations

- GIVEN a signed-in user in a browser, with the web app served by the production stack
- WHEN they open each section of the app and submit a form
- THEN the browser reports no Content Security Policy violation

### Requirement: Proxy trust

The production stack MUST set `TRUST_PROXY=1`, because Caddy is the only hop in front of the API and replaces any client-sent `X-Forwarded-For`.

#### Scenario: Spoofed forwarding header

- GIVEN the production stack is running
- WHEN one client sends failed login attempts, each with a different email and a different `X-Forwarded-For` value
- THEN they count against one client key, and the login limit blocks that client once it is reached

### Requirement: API documentation off in production

The API MUST NOT serve Swagger UI or the OpenAPI document when `NODE_ENV=production`, unless `API_DOCS_ENABLED=true`. Outside production it SHALL serve them at `/docs` unless `API_DOCS_ENABLED=false`. Any other non-empty `API_DOCS_ENABLED` value MUST make the API fail at startup. The production stack MUST pass `API_DOCS_ENABLED` from `prod.env`, defaulting to `false`.

#### Scenario: Default production stack

- GIVEN the production stack is running and `prod.env` leaves `API_DOCS_ENABLED` unset, empty or `false`
- WHEN a client requests `https://<SITE_ADDRESS>/api/docs`
- THEN the API answers 404

#### Scenario: Operator enables the docs

- GIVEN `prod.env` sets `API_DOCS_ENABLED=true`
- WHEN the operator restarts the stack and requests `https://<SITE_ADDRESS>/api/docs`
- THEN Swagger UI is served

#### Scenario: Invalid value

- GIVEN `API_DOCS_ENABLED=yes`
- WHEN the API starts
- THEN it fails at startup with an error naming `API_DOCS_ENABLED`

### Requirement: Database backups

The production stack MUST dump the database with `pg_dump` when it starts and every 24 hours after that, into the `backups/` directory next to the compose file, which Git and the Docker build context MUST ignore. A dump MUST appear under its final name only once `pg_dump` has completed. After each successful backup (the dump and its files archive), dumps older than `BACKUP_RETENTION_DAYS` days (default 14) MUST be deleted; a value that is not a positive integer written without a leading zero MUST make the backup service fail with an error naming `BACKUP_RETENTION_DAYS`, without writing a dump. A failed dump SHALL be logged and retried on the next cycle. After each dump, the stack MUST also write an archive of the uploaded files, `sfmanager-<same UTC timestamp>.files.tar.gz`, which MUST likewise appear under its final name only once complete and follows the same retention. The operator MUST be able to take a dump and to restore one with one documented command each; restoring MUST replace the whole database with the dump's contents and, when the dump has its files archive, the uploaded files with the archive's contents, keeping the API's user as their owner. A dump without a files archive MUST restore the database only, leave the uploaded files unchanged and say so. A file that is not a dump, or a files archive that cannot be read, MUST stop the restore before anything is changed. Unless off-site copies are configured (see "Off-site backup copies"), copying the dumps and archives off the server is the operator's responsibility, and the README MUST say so.

#### Scenario: Daily dump

- GIVEN the production stack is running
- WHEN it starts, and again every 24 hours
- THEN a new `sfmanager-<UTC timestamp>.dump` and `sfmanager-<UTC timestamp>.files.tar.gz`, with the same timestamp, appear in `backups/`

#### Scenario: Retention

- GIVEN `BACKUP_RETENTION_DAYS=14` and dumps and files archives in `backups/` older than 14 days
- WHEN the next backup succeeds
- THEN those older dumps and archives are deleted and the newer ones are kept

#### Scenario: Restore

- GIVEN a dump in `backups/` and a database whose data has changed since it was taken
- WHEN the operator stops the API, runs the documented restore command with that dump, and starts the API
- THEN the database holds exactly the data in the dump, and any migrations newer than the dump are applied
- AND the uploaded files are exactly those in the dump's files archive, owned by the API's user

#### Scenario: Restoring a dump without a files archive

- GIVEN a dump in `backups/` with no `.files.tar.gz` of the same timestamp, such as one taken before files were archived
- WHEN the operator runs the documented restore command with that dump
- THEN the database holds exactly the data in the dump, the uploaded files are unchanged, and the output says the files were left as they are

#### Scenario: Unreadable files archive

- GIVEN a dump whose `.files.tar.gz` cannot be read
- WHEN the operator runs the documented restore command with that dump
- THEN the restore fails before changing the database or the uploaded files

#### Scenario: Restoring a file that is not a dump

- GIVEN a files archive, or any other file that is not a dump, in `backups/`
- WHEN the operator runs the documented restore command with it
- THEN the restore fails before changing the database or the uploaded files

#### Scenario: Failed dump

- GIVEN the database is unreachable when a dump runs
- WHEN `pg_dump` fails
- THEN no new file named `sfmanager-*.dump` appears, no older dump is deleted, and the service keeps running

### Requirement: Off-site backup copies

The production stack MUST be able to copy the backups in `backups/` to an S3-compatible bucket on another provider. The copy is configured with `OFFSITE_S3_ENDPOINT`, `OFFSITE_S3_BUCKET`, `OFFSITE_S3_ACCESS_KEY_ID`, `OFFSITE_S3_SECRET_ACCESS_KEY` and `OFFSITE_ENCRYPTION_PASSWORD` in `prod.env`, which `prod.env.example` MUST list. With all of them empty the copy MUST be off: the service MUST say so in its log and keep running. With only some of them set, the service MUST fail with an error naming the missing ones.

When configured, the stack MUST copy every complete dump and files archive that is not yet in the bucket when it starts and every hour after that, and MUST NOT upload temporary files or any other file. The contents MUST be encrypted with `OFFSITE_ENCRYPTION_PASSWORD` before they leave the server. A copy MUST only add files: a backup already in the bucket MUST NOT be uploaded again, even when the local file has changed, a backup deleted from `backups/` MUST stay in the bucket, and the stack MUST NOT delete anything in it; expiring old copies is the bucket's own lifecycle rule, which the README MUST explain. A failed copy SHALL be logged and retried on the next cycle. The operator MUST be able to download and decrypt every copy into `backups/` with one documented command, which MUST fail without writing a file when the password is wrong. The README MUST say that the copies cannot be restored without the password, so it must be kept somewhere other than the server.

#### Scenario: Off-site copy is off by default

- GIVEN a `prod.env` with every `OFFSITE_*` variable empty
- WHEN the stack starts
- THEN the off-site copy service logs that it is disabled, keeps running, and uploads nothing

#### Scenario: Partial off-site configuration

- GIVEN a `prod.env` with `OFFSITE_S3_BUCKET` set and the other `OFFSITE_*` variables empty
- WHEN the off-site copy service starts
- THEN it fails with an error naming the missing variables

#### Scenario: Backups are copied encrypted

- GIVEN a configured off-site copy, and a dump, its files archive and a temporary `.partial` file in `backups/`
- WHEN the next copy runs
- THEN the dump and the archive are in the bucket, their contents unreadable without the password, and the temporary file is not

#### Scenario: Copies outlive the local backups

- GIVEN a backup already copied to the bucket
- WHEN it is deleted from `backups/`, for example by the retention, and the next copy runs
- THEN it is still in the bucket

#### Scenario: A damaged local backup does not replace its copy

- GIVEN a backup already copied to the bucket
- WHEN the local file changes, for example truncated or encrypted in place, and the next copy runs
- THEN the copy in the bucket is unchanged

#### Scenario: Restoring from the off-site copies

- GIVEN copies in the bucket and an empty `backups/` on a new server
- WHEN the operator runs the documented download command with the same `OFFSITE_*` settings
- THEN `backups/` holds the decrypted dumps and archives, readable by root only, ready for the restore command

#### Scenario: Wrong encryption password

- GIVEN copies in the bucket
- WHEN the operator runs the download command with a different `OFFSITE_ENCRYPTION_PASSWORD`
- THEN it fails and writes no file in `backups/`

### Requirement: Images built and published by CI

CI MUST build the API and web images from `docker-compose.prod.yml` on every pull request and every push to `main`, start the whole stack on `https://localhost` with throwaway secrets, and fail unless `/api/health` returns `{"status":"ok","db":"ok"}`, the web app answers 200, the API can write to `FILE_STORAGE_DIR` and the backup service writes a dump and a files archive, and the off-site copy service, left unconfigured, reports that it is disabled and keeps running. `deploy/smoke-test.sh` MUST run the same check locally. After CI passes on a push to `main`, a separate job, the only one allowed to write packages, MUST push both images to GitHub Container Registry as `ghcr.io/bcnsynergy/sf-manager-api` and `ghcr.io/bcnsynergy/sf-manager-web`, each tagged `sha-<short commit SHA>`, and move their `main` tag to that build only while `main` still points at that commit, so a slower run for an older commit never moves it back. Both images MUST name this repository as their source, so the packages are linked to it. Pull requests MUST NOT publish images.

#### Scenario: Broken image fails the PR

- GIVEN a pull request whose change stops an image from building or the stack from starting
- WHEN CI runs
- THEN the `ci` check fails, and its log shows the build error or the containers' state and recent logs

#### Scenario: Green main publishes

- GIVEN a push to `main` whose `ci` job passes
- WHEN the `publish` job runs
- THEN both images are in GitHub Container Registry tagged `sha-<short commit SHA>`, and their `main` tag points at that build unless a newer commit reached `main` first

#### Scenario: Pull request does not publish

- GIVEN a pull request, Dependabot's included
- WHEN CI runs
- THEN no image is pushed to any registry

### Requirement: Persistent data and secrets

Postgres data MUST persist in a named volume across container restarts and upgrades. Uploaded files (the organization logo) MUST persist in their own named volume, mounted at the API's `FILE_STORAGE_DIR`, which the API image MUST set and own as its non-root user. The API MUST fail at startup in production when `FILE_STORAGE_DIR` is unset or empty. The `backup` service archives that volume with each dump (see "Database backups"). Secrets MUST come from `prod.env`, which Git and the Docker build context MUST ignore; `prod.env.example` MUST list every variable the stack reads from it.

#### Scenario: Upgrade keeps data

- GIVEN a running production stack with data
- WHEN the operator checks out a newer version and runs the start command again
- THEN the data and the uploaded logo are still there and any new migrations are applied

#### Scenario: Secrets not committed

- GIVEN a filled-in `prod.env` at the repository root
- WHEN `git status` runs or an image is built
- THEN `prod.env` is neither listed as untracked nor copied into the build context
