# Deployment

Locator: `odd/tasks/deployment.md` (Engram mirror: `odd/deployment/tasks`).
Route: ODD; adds the main spec `openspec/specs/deployment/spec.md` (the specs are silent on deployment, so treat as Yes; precedent `continuous-integration`). Delivery: `ask-on-risk`, forecast about 350 authored lines, one PR on `deployment/01-compose-stack` with one work-unit commit per task. Test runner: none for Dockerfiles/Caddy/compose; checks are `docker compose build`, the stack started locally, and a browser pass. Risk: item 5 (delivery/environment), so an independent verifier runs at the feature's end.

## Specs

- S1: The chosen target, verbatim: "Compose en un VPS (Recomendado)" — "Dockerfiles para la API y la web, más un docker-compose de producción con Postgres y un proxy inverso (Caddy con HTTPS) que sirve la web y la API. Funciona en cualquier VPS o en local. TRUST_PROXY=1. Es lo más fino y no ata a ningún proveedor."
- S2: A production image for the API (`apps/api`) that builds the workspace packages it needs and runs `node dist/main` with `NODE_ENV=production`.
- S3: Pending migrations are applied (`prisma migrate deploy`) before the API starts serving; a failed migration stops the container instead of serving the old schema.
- S4: The first admin can be created inside the production stack with one documented command, from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, without the dev dataset (`NODE_ENV=production`).
- S5: One public origin: Caddy serves the built web app and forwards `/api/*` to the API with the prefix removed, so the API keeps its routes, `CORS_ORIGIN` is that origin, and the production cookie (`Secure`, `SameSite=Strict`) works. The web is built with `VITE_API_BASE_URL=/api`. Unknown paths fall back to `index.html` (client routing).
- S6: Caddy is the only hop in front of the API, so the stack sets `TRUST_PROXY=1`; ADR-011's open question 2 records that value for this topology.
- S7: Caddy obtains HTTPS automatically for the configured domain; with `localhost` as the domain the stack runs on a developer machine.
- S8: Postgres data persists in a named volume; Postgres and the API are not published on host ports, only Caddy (80/443).
- S9: Secrets (`JWT_SECRET`, Postgres password, seed admin credentials) come from an env file that is not committed; an example file lists every variable.
- S10: README gains a production deployment section (first start, admin creation, upgrade, backups out of scope); the spec `deployment` describes S2–S9.
- S11: Out of scope (ADR-006), registered: CI building/publishing images, automated deploy, backups, monitoring, exposing or hiding Swagger `/docs` in production (assumption: reachable at `/api/docs` until decided).

## Tasks

| ID  | Specs      | Scope                                                                                         | Route  | Status  | Commit / PR |
| --- | ---------- | --------------------------------------------------------------------------------------------- | ------ | ------- | ----------- |
| T1  | S2, S3, S4 | `apps/api/Dockerfile`, `.dockerignore`, start script with `migrate deploy`, admin seed        | inline | done    | (T1 commit) |
| T2  | S5, S7     | `apps/web/Dockerfile` (Vite build + Caddy), `Caddyfile`                                       | inline | pending |             |
| T3  | S6, S8–S11 | `docker-compose.prod.yml`, `.env.prod.example`, README, spec `deployment`, ADR-011, registers | inline | pending |             |

Route evidence: sequential units written inline by the parent; no writer trigger.

## Log

- L1 (2026-10-25, user, verbatim): "vamos con el slice de despliegue", then "Compose en un VPS (Recomendado)", then "si" to adding the main spec `openspec/specs/deployment/spec.md`.
- L2 (2026-10-25): analysis. Only a dev `docker-compose.yml` (Postgres) exists; no Dockerfile. TD-28 is already resolved (#206); only the production `TRUST_PROXY` value was open (ADR-011 open question 2). The API builds with `prisma generate && nest build` and runs `node dist/main`; the web reads `VITE_API_BASE_URL` at build time (three call sites). In production the auth cookie is `Secure` and `SameSite=Strict`, so the web and API must share one origin (S5). The seed runs through `ts-node` (dev dependency) and creates only the admin unless `NODE_ENV=development`. The Docker CLI is installed but the daemon was not running. Next: T1.
- L3 (2026-10-25): T1 done. `apps/api/Dockerfile` (single stage on `node:24-bookworm-slim` with OpenSSL; dev dependencies kept because `prisma migrate deploy` needs the Prisma CLI and the seed runs through ts-node) and a root `.dockerignore` (no `node_modules`, `dist` or env files in the context). No runnable unit test applies; checked against a throwaway Postgres on an isolated Docker network: the container applied all 18 migrations, then `/health` returned `200 {"status":"ok","db":"ok"}`; `npx prisma db seed` in the image created only `admin@example.com` as `SYSTEM_ADMIN`; with a wrong database password the container exited 1 without serving. Runs as user `node`. Next: T2.
