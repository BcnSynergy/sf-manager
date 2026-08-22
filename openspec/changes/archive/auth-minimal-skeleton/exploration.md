# Exploration: Minimal Authentication Skeleton

Scope: login + JWT/session issuance + a single "is there an authenticated
user or not" guard. No roles, no scoped RBAC yet (ADR-011's full 5-role
model is deferred, added per-entity as each slice needs it, per ADR-006's
addendum on tactical DDD design timing).

## Current State

**API** — Only module is `apps/api/src/modules/health`, and it explicitly
opts out of Clean Architecture layering (diagnostic endpoint only) — it is
the exception, not the pattern to copy. `app.module.ts` wires only
`PrismaModule` (global) + `HealthModule`; no global guard/interceptor yet.
`prisma.service.ts` is the sole allowed `@prisma/client` import site
(ADR-013, ESLint-enforced). `apps/api/prisma/schema.prisma` has zero
models. Grep across `apps/` for `User|password|jwt|bcrypt|argon2|passport`
found no hits — confirmed clean slate, no leftover scaffolding.

**Dependencies** — API has only `@nestjs/common/core/platform-express/swagger`,
`@prisma/client`+`@prisma/adapter-pg`, `dotenv`, `rxjs`. Nothing
auth-related: no `@nestjs/jwt`, no passport/`passport-jwt`, no
`bcrypt`/`argon2`, no `@nestjs/throttler`, no UUIDv7 generator. Web has
React 19, `react-router` v7, `react-i18next` — no auth/http libs beyond
native `fetch`.

**Web** — `App.tsx` has one route (`/` → `HealthPage`). `HealthPage.tsx`
(function component, `useTranslation`, `fetch` against
`VITE_API_BASE_URL`, `data-testid`) is the template a `LoginPage` should
follow. i18n keys live in `en/es/ca.json`.

**Relevant ADRs** — ADR-011 (accepted) already decided the *eventual* auth
shape: JWT access token (~15min) + rotating refresh token via
NestJS+Passport, argon2id (not bcrypt), refresh as
httpOnly+Secure+SameSite cookie, throttled login — full 5-role RBAC is out
of scope for this slice. ADR-005 (superseded) is where the demo-mode
"strictly environment-gated" constraint originates. ADR-009 requires
UUIDv7 generated in the application layer for every entity id (no library
currently installed). ADR-010 lists `User` as reference/master data with
`deletedAt` soft-delete. ADR-013 requires a hand-written `User` domain
entity + repository port, Prisma only in infrastructure.

## Affected Areas

- `apps/api/src/app.module.ts` — new `AuthModule` import; candidate for
  global `APP_GUARD`.
- `apps/api/prisma/schema.prisma` — needs a `User` model (currently
  empty).
- `apps/api/src/modules/health/presentation/health.controller.ts` —
  decide if `/health` stays public via a `@Public()` opt-out once a
  global guard exists.
- `apps/api/src/main.ts` — CORS `credentials: true` + `cookie-parser`
  needed if a cookie-based token delivery is chosen.
- `apps/api/package.json` — new deps needed: JWT lib, argon2 hasher,
  UUIDv7 generator, optionally `@nestjs/throttler`/`cookie-parser`.
- `apps/web/src/App.tsx`, new `apps/web/src/pages/LoginPage.tsx`,
  `apps/web/src/i18n/locales/{en,es,ca}.json`.
- New module tree `apps/api/src/modules/auth/{domain,application,
  infrastructure,presentation}/` per ADR-002 — module boundary (`auth`
  alone vs `users`+`auth`) is an open question.

## Approaches Considered (token/session delivery for this slice)

1. **Access-token-only JWT, no refresh** — simplest, matches minimal
   scope; but silent logout on expiry, and `localStorage` storage is the
   weak option ADR-011 steers away from. Effort: Low.
2. **Access + rotating refresh token (httpOnly cookie), full ADR-011
   shape now** — no retrofit later; but rotation logic, revocation store,
   CORS/cookie wiring — arguably over-scoped for a walking skeleton.
   Effort: Medium-High.
3. **Single access token via httpOnly cookie, no refresh** — keeps the
   eventual delivery mechanism (cookie) without rotation machinery;
   avoids `localStorage`. Still needs `cookie-parser` + CORS wiring now.
   Effort: Low-Medium.

**Recommendation**: Option 3 — least likely to be discarded when refresh
tokens are added later, without the weakest security posture now.
Password hashing is not an open fork: ADR-011 already decided argon2id
over bcrypt; this slice follows it (`node-argon2`, currently absent).

## Open Questions for sdd-propose

- **FR-012 demo-mode scope**: build the bypass now (near-zero marginal
  cost as a guard-level short-circuit) or defer until there's more than
  health-check to demo?
- **Module boundary**: one `auth` module, or `users` + `auth` split
  (ADR-011 treats FR-003 user-mgmt and FR-011 auth as related but
  separate)?
- **Guard shape**: global `APP_GUARD` + `@Public()` opt-out (new pattern
  for this codebase) vs per-controller guard?
- **UUIDv7 library**: `uuid` v9+/v11 (has v7) vs dedicated `uuidv7`
  package — low-stakes.
- **CORS/cookie wiring**: not currently present, needed for options 2/3.
- **argon2 native binding**: generally ships prebuilt binaries, worth a
  quick Windows dev-env check in design.

## Ready for Proposal

Yes.
