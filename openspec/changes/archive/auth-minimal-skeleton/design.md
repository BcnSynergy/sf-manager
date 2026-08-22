# Design: Minimal Authentication Skeleton

## Technical Approach

Two Nest modules built to full ADR-002 layering: `users` (owns the `User`
entity + repository port + Prisma adapter) and `auth` (credential
verification, token issuance, guard). Login verifies an argon2id hash and
signs one JWT with `@nestjs/jwt`, returned as an httpOnly cookie. A global
`APP_GUARD` verifies that cookie unless the handler is marked `@Public()`.
Web adds `/login`, a `ProtectedRoute`, and calls `GET /auth/me` to learn
session state (the cookie is invisible to JS). Resolves every Open Question
in the proposal.

## Architecture Decisions

| # | Question | Decision | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Module boundary | Split `users` + `auth` | Single `auth` module | ADR-002 explicitly names `users` as a domain module. FR-003's later CRUD slice would otherwise have to import the entity/port out of `auth` (backwards dependency) or move files. Cost today is one extra `users.module.ts`; `users` gets no controller/use case in this slice. |
| 2 | JWT library | `@nestjs/jwt` only | `passport-jwt` + `@nestjs/passport` | Passport is 4 deps + a strategy class + a custom cookie extractor to answer one boolean. The guard is one class behind `TokenIssuer`; swapping its body for `AuthGuard('jwt')` later touches no controller, no `@Public()`, no use case. Deviates from ADR-011 §4 — record as an ADR-011 addendum (see Follow-ups). |
| 3 | UUIDv7 | `uuid` v11 (`import { v7 }`) | `uuidv7` package, Postgres `uuidv7()` | `uuid` is the maintained ecosystem standard and already ships v7; a second single-purpose dep buys nothing. DB default rejected by ADR-009. Port `IdGenerator` in `shared/application`, adapter in `shared/infrastructure` so every later entity reuses it. |
| 4 | Guard shape | Global `APP_GUARD` + `@Public()` | Per-controller `@UseGuards` | Secure-by-default: cost today is two `@Public()` marks (health, login); per-controller fails **open** — every future module must remember it. `@Public()` lives in `shared/presentation` so `health` never imports `auth`. |
| 5 | Expiry / cookie | `JWT_EXPIRES_IN=2h`; cookie `sf_access_token`, `httpOnly`, `path=/`, `maxAge`=expiry; dev `secure:false, sameSite:'lax'`, prod `secure:true, sameSite:'strict'`. CORS `origin`: a `CORS_ORIGIN` env var (e.g. `http://localhost:5173` in dev, the actual prod web origin in prod), passed to `enableCors({ origin: process.env.CORS_ORIGIN, credentials: true })` in `main.ts` — a wildcard `origin: '*'` is invalid together with `credentials: true` per the Fetch/CORS spec, so an explicit origin is required for the credentialed cookie flow to work at all | 15 min (ADR-011), 8h; wildcard CORS `origin: '*'` | No refresh token exists, so 15 min means constant manual re-login; 2h bounds a non-revocable-by-expiry token to one working block (logout revokes explicitly — see Decision 9). Dev `lax` suffices because `:5173`→`:3000` is same-site. Prod `strict` assumes web+API share a registrable domain — **no ADR currently decides the production web/API domain topology**; this is an open assumption (see proposal Risks). If web and API end up on different registrable domains, switch to `sameSite:'none'` + `secure`. Wildcard CORS origin is rejected outright by browsers for credentialed requests, not just a weaker posture — an explicit `CORS_ORIGIN` is the only workable option here. |
| 6 | Login identifier | `email` | `username` | Unique natural key, already assumed by the spec's response-shape scenario, and the identifier a later password-reset slice needs. |
| 7 | Soft-deleted login | **Rejected.** `UserRepository.findByEmail` applies ADR-010's default `deletedAt: null` filter, so the use case receives `null` and returns the *same* generic 401 — no new distinguishable message | Allow login | Makes ADR-011's "disable a user via `deletedAt`" actually revoke access. Known gap: soft-delete does not itself revoke an already-issued cookie (only explicit logout does, via Decision 9) — it stays valid until natural expiry. |
| 8 | Logo asset | `apps/web/public/logo.svg`, `<img src="/logo.svg">`; committed placeholder SVG wordmark | `src/assets/` import | Matches the existing `public/favicon.svg` convention. Public URL is stable, so replacing the placeholder later is a file swap with zero code change; a hashed `src/assets` import buys nothing for one image. |
| 9 | Logout revocation | Minimal server-side deny-list: `RevokedToken` table (`jti` PK, `expiresAt`); `TokenIssuer.sign` embeds a `jti` claim generated via `uuid`'s random `v4()` — deliberately NOT the `IdGenerator`/UUIDv7 port used for entity ids (Decision 3), because `jti` is a token identifier, not a domain entity, and UUIDv7 would embed an approximate issuance timestamp into every `RevokedToken` row (ADR-009's own stated reason to avoid raw UUIDv7 exposure in some contexts); the guard rejects a token whose `jti` is denylisted, in addition to the normal signature/expiry check; logout inserts the current token's `jti` with the token's own `exp`; `TokenDenylist.revoke()` MUST be idempotent — implemented as an upsert keyed on `jti` (Prisma `upsert` / `ON CONFLICT DO NOTHING`), so a concurrent duplicate call for the same still-valid cookie (e.g. double-click, two tabs racing before either commits) is a no-op success, not a unique-constraint violation; expired rows are opportunistically deleted (`expiresAt < now()`) on login and logout — no cron job for this slice | Fully stateless JWT (no revocation); `jti` via `IdGenerator`/UUIDv7 | Required to satisfy the spec's Logout requirement ("reusing the old cookie value on a protected endpoint MUST return 401") — a purely stateless token cannot make that guarantee before natural expiry. This is the minimum viable revocation mechanism, not a general session-management feature; it does not reopen refresh-token rotation (still out of scope). `jti` as primary key means a naive insert on a repeated logout call would hit a unique-constraint error instead of succeeding cleanly — idempotency via upsert closes that gap. Note: this "no-op success via upsert" framing applies only to genuinely concurrent duplicate calls; a *sequential* retry sent after the first logout call has already committed the revoke never reaches this upsert at all — `AuthenticatedGuard` checks `TokenDenylist.isRevoked(jti)` first and rejects with 401 before the request reaches `LogoutUseCase`, which is also an acceptable outcome, just via a different path. |
| 10 | Dummy-hash timing mitigation params | The fixed dummy hash used when the email is not found MUST be pre-generated with the identical argon2id parameters used for real password hashing (memoryCost 19456, timeCost 2, parallelism 1) and stored as a constant; it MUST be kept in sync if those parameters are ever tuned | Deriving/regenerating the dummy hash per-request; using arbitrary/weaker params | Argon2's verify cost is driven by the parameters encoded inside the hash string itself, not by a global setting — a dummy hash with different or stale parameters reopens the timing side-channel silently, defeating the mitigation added in Judgment Day Round 1 |

Config is read via plain `process.env` in one typed factory (`auth.config.ts`)
that throws on a missing `JWT_SECRET` or `CORS_ORIGIN` at boot — an unset
`CORS_ORIGIN` must fail fast, not silently fall through to `enableCors`
treating a falsy `origin` as "allow any origin" (the `cors` package's
default behavior for a missing/undefined `origin` option), which would
silently recreate the wildcard-plus-credentials misconfiguration Decision 5
exists to prevent. Consistent with the existing `dotenv/config` import in
`main.ts`; `@nestjs/config` is not introduced.

## Data Flow

    POST /auth/login ─→ AuthController ─→ LoginUseCase
                                            │  UserRepository.findByEmail (deletedAt IS NULL)
                                            │  PasswordHasher.verify (argon2id) — if the user is not found, verify
                                            │    against a fixed dummy hash (pre-generated with the SAME argon2id
                                            │    params as real password hashes: memoryCost 19456, timeCost 2,
                                            │    parallelism 1 — kept in sync if those params are ever tuned)
                                            │    instead of skipping straight to 401, so the unknown-email and
                                            │    wrong-password paths take comparable time
                                            │  ── verify fails ─→ 401 (no further steps; TokenDenylist.deleteExpired()
                                            │       is NOT called here, so a brute-force attempt against login
                                            │       doesn't also hammer the deny-list table with cleanup queries)
                                            │  ── verify succeeds ─→
                                            │       TokenDenylist.deleteExpired() — opportunistic cleanup, run only
                                            │         after a successful login, `expiresAt < now()`
                                            └─      TokenIssuer.sign({sub,email,jti}) — jti is a fresh uuid v4()
                                                    (NOT the IdGenerator/UUIDv7 port — see Decision 9)
                          ↩ Set-Cookie: sf_access_token (httpOnly) + { id, email }

    POST /auth/logout ─→ AuthenticatedGuard ─→ Reflector: @Public()? ── no (not public) ─→
                          │ TokenIssuer.verify(cookie) → { jti, ... } | 401 (invalid/expired signature)
                          │ → TokenDenylist.isRevoked(jti)? ── yes ─→ 401
                          │                              └─ no ─→ pass
                          └─ AuthController ─→ LogoutUseCase
                                            │  TokenIssuer.verify(cookie) → { jti, exp }
                                            │  TokenDenylist.revoke(jti, expiresAt: exp) — idempotent upsert keyed on
                                            │    `jti`; a duplicate/retried logout call for the same token is a
                                            │    no-op success, not a unique-constraint error
                                            └─ TokenDenylist.deleteExpired() — opportunistic cleanup, `expiresAt < now()`
                                              (logout is already gated on having a valid session, so this cleanup
                                              call is not exposed to unauthenticated brute-force traffic)
                          ↩ clearCookie(sf_access_token) — MUST use the same `httpOnly`/`path`/`sameSite`/`secure`
                            attributes as the login `Set-Cookie` call for the current environment, otherwise some
                            browsers silently fail to clear it

    GET /auth/me ─→ AuthenticatedGuard ─→ Reflector: @Public()? ── yes ─→ pass
                          │ no → TokenIssuer.verify(cookie) → { jti, sub, email } | 401 (invalid/expired signature)
                          │      → TokenDenylist.isRevoked(jti)? ── yes ─→ 401
                          │                                    └─ no ─→ req.user
                          └─ AuthController ─→ GetCurrentUserUseCase → maps req.user to { id, email }

## File Changes

| File | Action |
|---|---|
| `apps/api/prisma/schema.prisma` | Modify — add `User`, `RevokedToken` |
| `apps/api/prisma/migrations/*_add_user/` | Create — first real migration (`User`, `RevokedToken`) |
| `apps/api/prisma/seed.ts` | Create — seeds admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`; normalizes the email by parsing `{ email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD }` through the FULL `loginRequestSchema` (not just its `.shape.email` field in isolation), which also enforces `password.min(1)` against `SEED_ADMIN_PASSWORD` as a cheap sanity check before hashing — same normalization path as login; bootstraps via `NestFactory.createApplicationContext(AppModule)` to resolve real DI instances (`PrismaService`, `ID_GENERATOR`, `PASSWORD_HASHER`, `USER_REPOSITORY`) instead of manually `new`-ing them — this is what supplies the `IdGenerator` (UUIDv7 id, ADR-009) and `PasswordHasher` (argon2id hash of `SEED_ADMIN_PASSWORD`) the entity/upsert need, and ensures `app.close()` is called at the end so Nest's lifecycle hooks (`PrismaService.onModuleDestroy` → `$disconnect()`) run and the script doesn't hang on exit; calls the resolved `UserRepository`'s `save()` method instead of issuing a raw `prisma.user.upsert()`, so seeding goes through the same repository port as the rest of the module (ADR-013) |
| `apps/api/prisma.config.ts` | Modify — add `migrations.seed` command |
| `apps/api/src/shared/application/ports/id-generator.port.ts` | Create — `IdGenerator` + `ID_GENERATOR` token |
| `apps/api/src/shared/infrastructure/id/uuid-v7.id-generator.ts` | Create |
| `apps/api/src/shared/infrastructure/id/id-generator.module.ts` | Create — `@Global()`, mirrors `PrismaModule` |
| `apps/api/src/shared/infrastructure/persistence/soft-deletable.repository.ts` | Create — base class/mixin encapsulating the `deletedAt: null` default filter (ADR-010), so it's a shared repository-base concern rather than reimplemented per module |
| `apps/api/src/shared/presentation/decorators/public.decorator.ts` | Create — `IS_PUBLIC_KEY`, `@Public()` |
| `apps/api/src/shared/presentation/pipes/zod-validation.pipe.ts` | Create |
| `apps/api/src/modules/users/users.module.ts` | Create |
| `apps/api/src/modules/users/domain/user.entity.ts` | Create |
| `apps/api/src/modules/users/application/ports/user.repository.port.ts` | Create — `UserRepository` + `USER_REPOSITORY` (`findByEmail`, `save`) |
| `apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts` | Create — extends `SoftDeletableRepository` for the default `deletedAt: null` filter; implements `findByEmail` and `save` (upsert by unique email) |
| `apps/api/src/modules/users/infrastructure/persistence/user.mapper.ts` | Create |
| `apps/api/src/modules/auth/auth.module.ts` | Create — also registers `APP_GUARD` |
| `apps/api/src/modules/auth/domain/invalid-credentials.error.ts` | Create |
| `apps/api/src/modules/auth/application/ports/password-hasher.port.ts` | Create — `PasswordHasher` + `PASSWORD_HASHER` |
| `apps/api/src/modules/auth/application/ports/token-issuer.port.ts` | Create — `TokenIssuer` + `TOKEN_ISSUER` |
| `apps/api/src/modules/auth/application/ports/token-denylist.port.ts` | Create — `TokenDenylist` + `TOKEN_DENYLIST` (`isRevoked`, `revoke`, `deleteExpired`) |
| `apps/api/src/modules/auth/application/use-cases/login.use-case.ts` | Create |
| `apps/api/src/modules/auth/application/use-cases/logout.use-case.ts` | Create — verifies the cookie, revokes its `jti` |
| `apps/api/src/modules/auth/application/use-cases/get-current-user.use-case.ts` | Create — maps the guard's `req.user` to `{ id, email }`, so `GET /auth/me` follows the same layered pattern as login/logout instead of being a presentation-layer passthrough |
| `apps/api/src/modules/auth/infrastructure/hashing/argon2-password.hasher.ts` | Create |
| `apps/api/src/modules/auth/infrastructure/token/jwt-token.issuer.ts` | Create — includes `jti` (uuid `v4()`, not the `IdGenerator`/UUIDv7 port — see Decision 9) in the signed payload |
| `apps/api/src/modules/auth/infrastructure/persistence/prisma-token-denylist.adapter.ts` | Create — `RevokedToken` Prisma adapter for `TokenDenylist`; `revoke()` implemented as a Prisma `upsert` keyed on `jti` for idempotency |
| `apps/api/src/modules/auth/infrastructure/config/auth.config.ts` | Create |
| `apps/api/src/modules/auth/presentation/auth.controller.ts` | Create — `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| `apps/api/src/modules/auth/presentation/dto/login-request.dto.ts` | Create |
| `apps/api/src/modules/auth/presentation/dto/auth-user-response.dto.ts` | Create |
| `apps/api/src/modules/auth/presentation/guards/authenticated.guard.ts` | Create — checks signature/expiry, then `TokenDenylist.isRevoked(jti)` |
| `apps/api/src/modules/auth/presentation/decorators/current-user.decorator.ts` | Create |
| `apps/api/src/modules/health/presentation/health.controller.ts` | Modify — `@Public()` |
| `apps/api/src/app.module.ts` | Modify — import `UsersModule`, `AuthModule`, `IdGeneratorModule` |
| `apps/api/src/main.ts` | Modify — `cookie-parser`, `enableCors({ origin: process.env.CORS_ORIGIN, credentials: true })` (see Decision 5 note) |
| `packages/validation/src/auth/login.schema.ts` | Create — `loginRequestSchema` (ADR-015 single source) |
| `apps/web/public/logo.svg` | Create — placeholder |
| `apps/web/src/pages/LoginPage.tsx`, `src/auth/AuthProvider.tsx`, `src/auth/ProtectedRoute.tsx`, `src/App.tsx` | Create/Modify |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify — `auth.*` keys |
| `README.md` | Modify — new env vars, `prisma:migrate`, `prisma:seed` |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Modify — add an addendum section documenting this slice's deviations (no Passport, 2h non-rotating expiry, no rate limiting yet) with rationale and reversibility |

New deps: api — `@nestjs/jwt`, `argon2`, `uuid`, `cookie-parser`, `zod`,
`@types/cookie-parser`; web — `zod`.

## Interfaces / Contracts

```prisma
model User {
  id           String    @id @db.Uuid   // UUIDv7 from the app (ADR-009)
  email        String    @unique         // stored lowercase-normalized
  passwordHash String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?                 // ADR-010
}

model RevokedToken {
  jti       String   @id @db.Uuid        // the token's own jti claim
  expiresAt DateTime                     // copied from the token's own exp — row is safe to delete once past

  @@index([expiresAt])                   // the opportunistic cleanup query (`WHERE expiresAt < now()`) runs on
                                          // every login/logout, so this must not be a full table scan
}
```

No `role`/`managerCapabilities` column — roles are out of scope and added by
the slice that needs them. `RevokedToken` is a deny-list, not a session
table: it only ever holds explicitly logged-out tokens until their natural
expiry (minimum viable revocation for fix of the Logout requirement, not a
general session-management feature).

```ts
// packages/validation — shared by the API pipe and the web form
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()), // trim/lowercase BEFORE the email-format check,
                                                            // so leading/trailing whitespace doesn't fail
                                                            // validation before normalization ever runs
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Response body — never the hash, never the raw token
export type AuthUserResponse = { id: string; email: string };

// JWT payload
type AccessTokenPayload = { sub: string; email: string; jti: string }; // + iat/exp

// TokenDenylist port (application) — checked by the guard, written by logout
export interface TokenDenylist {
  isRevoked(jti: string): Promise<boolean>;
  revoke(jti: string, expiresAt: Date): Promise<void>; // MUST be idempotent — upsert keyed on jti; a repeated
                                                         // call for the same jti is a no-op success, not an error
  deleteExpired(): Promise<void>; // opportunistic cleanup, called on login (only after success) and logout
}

// UserRepository port (application) — read used by login, write used by seed.ts and integration test setup
export interface UserRepository {
  findByEmail(email: string): Promise<User | null>; // default deletedAt: null filter (ADR-010)
  save(user: User): Promise<void>; // upsert by unique email — not exposed via any controller (FR-003 CRUD is a later slice)
                                    // on the UPDATE path (email already exists), the existing row's `id` is
                                    // PRESERVED: the Prisma `update` payload omits `id` entirely, so a fresh
                                    // UUIDv7 generated by the caller (e.g. seed.ts on every run) never overwrites
                                    // the original identity (ADR-009) — matters for "reseed manually" (Out of Scope)
}
```

Swagger documents the login body with an explicit `@ApiBody({ schema })`
since Zod-inferred types carry no decorator metadata (class-validator DTO
classes rejected by ADR-015).

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Spike (first) | argon2 native binding on Windows | Standalone `argon2-password.hasher.spec.ts` hashing + verifying a known password, run before any other implementation task. If the prebuilt binary fails, swap the adapter to `@node-rs/argon2` (Rust napi prebuilds, still argon2id) — one file changes because of the `PasswordHasher` port. Params: argon2id, memoryCost 19456, timeCost 2, parallelism 1. |
| Unit | `LoginUseCase`: valid, wrong password, unknown email (dummy-hash verify still runs, comparable timing), soft-deleted (all failures identical) | Jest + in-memory fake repo/hasher |
| Unit | `LogoutUseCase`: valid session revokes the token's `jti` via `TokenDenylist.revoke` with the token's own `exp` | Jest + fake `TokenIssuer`/`TokenDenylist` |
| Unit | `TokenDenylist.revoke()` idempotency: calling `revoke()` twice with the same `jti` succeeds both times (no unique-constraint error), asserting the upsert-on-duplicate-jti behavior | Jest + `PrismaTokenDenylistAdapter` against a mocked Prisma client only — the real-DB variant is a separate Integration row below, since a mock cannot validate that Postgres's actual `ON CONFLICT`/upsert semantics hold |
| Unit | `AuthenticatedGuard`: `@Public()` bypass, missing/expired/tampered cookie, valid signature but denylisted `jti` → 401 | Jest + mocked `ExecutionContext` + fake `TokenDenylist` |
| Unit | `GetCurrentUserUseCase`: maps `req.user` to `{ id, email }` only, no extra fields leak | Jest |
| Unit | `UserMapper`, `UuidV7IdGenerator` (v7 format + monotonic ordering) | Jest |
| Integration | `PrismaUserRepository.findByEmail` and `.save` against a real (test) Postgres 18 instance, migrated via the actual migration; uses `UserRepository.save()` (not raw Prisma) to set up the soft-deleted-row fixture, asserting the `deletedAt: null` filter excludes soft-deleted rows; a second assertion calls `save()` twice with the same email and asserts the second call performs an UPDATE of the existing row (upsert semantics), not a duplicate INSERT, AND that the row's `id` is unchanged across both calls (the update path preserves the original identity, ADR-009) — `save()` is an upsert by design (Decision 9/seed.ts usage), so this test verifies that behavior rather than a unique-constraint violation | Jest + a dedicated test database, migration applied with `prisma migrate deploy` before the suite runs |
| Integration | `PrismaTokenDenylistAdapter.revoke()` called twice with the same `jti` against the real test database succeeds both times with no unique-constraint violation — validates that Postgres's actual upsert/`ON CONFLICT` behavior holds (the Unit row above only proves the adapter *calls* upsert, not that Postgres honors it) | Jest + the same dedicated test database as the `PrismaUserRepository` integration suite |
| E2E | login → cookie → `/auth/me` 2xx; no cookie → 401; `/health` public; logout then reuse → 401 (now actually enforced via `TokenDenylist`); cross-origin request asserts `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` response headers | supertest; `USER_REPOSITORY` and `TOKEN_DENYLIST` overridden with in-memory impls, `USER_REPOSITORY` seeded with a real argon2 hash — hermetic, no test DB needed. The test app's bootstrap MUST explicitly re-apply `cookie-parser` and `enableCors(...)` exactly as `main.ts` does — a Nest `TestingModule`-built `INestApplication` does not inherit `main.ts`'s bootstrap-only middleware automatically, so omitting this would make the CORS assertion a false pass/fail |
| Web | LoginPage required-field block, generic 401 message, logo renders; `ProtectedRoute` redirect | Vitest + Testing Library, `fetch` mocked |

Strict TDD is enabled (`openspec/config.yaml`): tests first, per unit.

## Migration / Rollout

First real migration — repo moves from `prisma db push` to
`prisma migrate dev`. Seed is idempotent (`upsert` by email). Rollback per
the proposal: revert the branch, drop the `User` and `RevokedToken` tables,
remove `AuthModule` from `app.module.ts` to restore open endpoints.

## Follow-ups (not blocking)

- ADR-011 addendum (`docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`,
  see File Changes): this slice uses `@nestjs/jwt` without Passport and a
  single non-rotating 2h access token; Passport + refresh rotation remain the
  target shape and are reachable behind `TokenIssuer` without a rewrite.
- ADR-011 §4 rate limiting (`@nestjs/throttler`) is deferred for this slice —
  an accepted, time-boxed brute-force exposure window on the login endpoint;
  revisit alongside the refresh-token slice. Document this alongside the
  other two ADR-011 deviations in the same addendum.
- Soft-delete does not itself revoke an already-issued cookie: the
  `TokenDenylist` (see Architecture Decision 9) only revokes tokens on
  explicit logout, not on soft-delete — a soft-deleted user's existing
  cookie stays valid until natural expiry (max 2h) even though a fresh
  login attempt is rejected.

## Open Questions

None — all eight proposal questions are resolved above (decisions 1–8),
plus decision 9 (logout revocation), added during Judgment Day Round 1 to
make the Logout requirement satisfiable, and decision 10 (dummy-hash timing
mitigation params), added during Judgment Day Round 2 to keep the timing
mitigation from silently degrading.
