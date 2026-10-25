# Deployment Specification

## Purpose

Defines how SF-Manager runs in production: one Docker Compose stack on a single server, with Postgres, the API, and Caddy as the only public entry point for both the web app and the API.

## Requirements

### Requirement: One-command production stack

The repository MUST provide `docker-compose.prod.yml`, which builds the API and web images from the repository and starts Postgres, the API and Caddy with one `docker compose ... up -d --build` command. Its Compose project name MUST differ from the dev stack's, so both can run on one machine.

#### Scenario: First start

- GIVEN a server with Docker and a filled-in `prod.env`
- WHEN the operator runs `docker compose -f docker-compose.prod.yml --env-file prod.env up -d --build`
- THEN Postgres, the API and Caddy are running
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

### Requirement: Proxy trust

The production stack MUST set `TRUST_PROXY=1`, because Caddy is the only hop in front of the API and replaces any client-sent `X-Forwarded-For`.

#### Scenario: Spoofed forwarding header

- GIVEN the production stack is running
- WHEN one client sends failed login attempts, each with a different email and a different `X-Forwarded-For` value
- THEN they count against one client key, and the login limit blocks that client once it is reached

### Requirement: Persistent data and secrets

Postgres data MUST persist in a named volume across container restarts and upgrades. Secrets MUST come from `prod.env`, which Git and the Docker build context MUST ignore; `prod.env.example` MUST list every variable the stack reads from it.

#### Scenario: Upgrade keeps data

- GIVEN a running production stack with data
- WHEN the operator checks out a newer version and runs the start command again
- THEN the data is still there and any new migrations are applied

#### Scenario: Secrets not committed

- GIVEN a filled-in `prod.env` at the repository root
- WHEN `git status` runs or an image is built
- THEN `prod.env` is neither listed as untracked nor copied into the build context
