# Proposal: Minimal Authentication Skeleton

## Intent

Every endpoint is currently open and no `User` exists. Before any real
domain slice (communities, inspections) can be scoped, the app needs one
question answered end-to-end: **is there an authenticated user, yes/no?**
This slice delivers the thinnest vertical answer — a seeded admin logs in
from the web and reaches a protected endpoint — and becomes the first
module built to full ADR-002 layering (health is the documented exception).
It is a first step toward FR-011/ADR-011, not its completion.

## Scope

### In Scope

- `User` Prisma model + first migration (UUIDv7 id per ADR-009, `deletedAt`
  per ADR-010) and a seed script creating one admin user.
- Auth module under `apps/api/src/modules/auth/` with `domain/`,
  `application/`, `infrastructure/`, `presentation/` (ADR-002): hand-written
  `User` entity, repository port in application, Prisma adapter in
  infrastructure only (ADR-013).
- Login endpoint: verify credentials (argon2id per ADR-011), issue one JWT
  access token in an httpOnly cookie. Logout clears it.
- One guard answering authenticated yes/no, with a public opt-out so
  `/health` and login stay open.
- `main.ts`: `cookie-parser`, CORS `credentials: true`.
- Web: `LoginPage` + `/login` route, redirect-when-unauthenticated,
  i18n keys in `en/es/ca`, app logo (static asset — SF-Manager's own
  branding, not ADR-012's `PropertyManagementCompany` logo).

### Out of Scope (explicit non-goals)

- User registration or user CRUD — FR-003, later slice.
- Demo mode — FR-012, deferred until there is domain worth demoing.
- Password reset/recovery — reseed manually instead.
- Refresh token, rotation, general session-management revocation. Expiry
  means manual re-login. (Narrow exception: logout uses a minimal
  server-side deny-list so a captured token can't be reused after explicit
  logout — see `sdd-design` Decision 9 — this is not general revocation.)
- Roles, `managerCapabilities`, `PermissionChecker`, scoped RBAC — ADR-011's
  5-role model is deferred and added per-entity in later slices (ADR-006).
- Rate limiting (`@nestjs/throttler`), account lockout, audit logging.

## Capabilities

### New Capabilities

- `authentication`: credential verification, token issuance/clearing, and
  authenticated-or-not access control for API endpoints.

### Modified Capabilities

- None (no specs exist yet).

## Approach

Exploration option 3: a single access token delivered via httpOnly cookie.
This keeps ADR-011's eventual *delivery mechanism* while skipping rotation
machinery, and avoids `localStorage`. Later slices extend rather than
replace: add a refresh endpoint, shorten access expiry, layer roles onto the
existing guard.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modified | First `User` model + migration |
| `apps/api/prisma/seed.ts` | New | Seeds one admin user |
| `apps/api/src/modules/auth/**` | New | Four-layer auth module |
| `apps/api/src/app.module.ts` | Modified | Import auth module; guard wiring |
| `apps/api/src/main.ts` | Modified | cookie-parser, CORS credentials |
| `apps/api/src/modules/health/**` | Modified | Marked public |
| `apps/api/package.json` | Modified | JWT lib, argon2, UUIDv7 lib, cookie-parser |
| `apps/web/src/pages/LoginPage.tsx`, `App.tsx` | New/Modified | Login route + guarded routing |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Login keys |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| argon2 native bindings fail on Windows dev | Med | Verify prebuilt binary early in apply; swap to a library with broader prebuilt-binary platform coverage (`@node-rs/argon2`, Rust napi prebuilds), still argon2id |
| Guard pattern is new; over-generalizing it | Med | One boolean check only; no role parameterization |
| Cookie/CORS misconfig blocks localhost login | Med | E2E test covering login → protected call, including asserting CORS response headers |
| Single non-rotating token is a weaker posture | Low | Documented, time-boxed; short expiry; revisit when refresh lands |
| Production web/API domain topology is undecided by any ADR | Med | Design's prod cookie choice (`sameSite:'strict'`) assumes a shared registrable domain; documented fallback to `sameSite:'none'` + `secure` if web and API end up on different registrable domains; revisit when a deployment/infra ADR fixes the topology |
| No rate limiting on login (ADR-011 §4 deferred) | Med | Accepted, time-boxed brute-force exposure window for this slice; revisit when `@nestjs/throttler` lands |
| Per-request deny-list check (`TokenDenylist.isRevoked`) couples every protected endpoint's availability to DB reachability — previously a stateless JWT needed no DB round-trip to validate | Low | Accepted tradeoff: it is the minimum-viable revocation this slice needs (see `sdd-design` Decision 9); revisit if DB reachability becomes a measured availability problem |

## Rollback Plan

Revert the branch and run `prisma migrate reset` (drops the dev database and
reapplies the remaining migration history) to remove the `User` and
`RevokedToken` tables; no other slice depends on them. The guard is the only global wiring —
removing the `AuthModule` import from `app.module.ts` restores fully open
endpoints. No data migration of existing records is involved (table is new).

## Dependencies

- New npm deps (exact choices deferred to design): JWT library, argon2id
  hasher, UUIDv7 generator, `cookie-parser`.
- Reachable PostgreSQL 18 with `DATABASE_URL` set for migration + seed.

## Open Questions for `sdd-design`

- Module boundary: single `auth` module vs `users` + `auth` split.
- Exact JWT library: `@nestjs/jwt` alone vs `passport-jwt` (ADR-011 names
  Passport for the eventual shape).
- UUIDv7 library: `uuid` v11 vs dedicated `uuidv7`; where the generator port
  lives so later entities reuse it.
- Global `APP_GUARD` + `@Public()` vs per-controller guard.
- Token expiry value and cookie flags per environment.
- Login identifier: email vs username on the `User` model.
- Whether soft-deleted users are rejected at login (ADR-010 default filter).
- App logo asset: source file format/placement (e.g. `apps/web/public/logo.svg`) — placeholder vs final asset.

## Success Criteria

- [ ] Seed script creates one admin user with an argon2id-hashed password.
- [ ] Valid credentials at the login endpoint return 2xx and set an httpOnly
      cookie; invalid credentials return 401 without leaking which field failed.
- [ ] A protected endpoint returns 401 without the cookie and 2xx with it.
- [ ] A cookie reused on a protected endpoint after logout returns 401
      (the deny-list guarantee).
- [ ] `GET /auth/me` returns `{ id, email }` when authenticated and 401
      otherwise.
- [ ] Cross-origin requests carry the expected CORS response headers
      (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`).
- [ ] `/health` remains reachable unauthenticated.
- [ ] Web: login from `/login` succeeds, unauthenticated visits to a
      protected route redirect to `/login`, logout clears the session.
- [ ] `no-restricted-imports` still passes — no `@prisma/client` outside
      `infrastructure/persistence/**`.
- [ ] API and web test suites pass (`npm run test --workspace=apps/api`,
      `--workspace=apps/web`).
