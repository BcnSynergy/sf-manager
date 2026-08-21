# Tasks: Minimal Authentication Skeleton

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1200-1800 (≈35 files, 2 new Nest modules, shared infra, migration, web auth, tests per Strict TDD) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 6 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk — resolved: chained PRs |
| Chain strategy | stacked-to-main (each PR merges to main in order) |

Decision needed before apply: Resolved
Chained PRs: Yes — 6 units, stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Spike + shared infra + Prisma schema/migration/seed | PR 1 | No runtime behavior change yet; safe standalone merge |
| 2 | `users` module (entity/port/adapter/mapper) | PR 2 | Depends on PR 1 (IdGenerator, SoftDeletableRepository) |
| 3 | `auth` module (application+infra+presentation) | PR 3 | Depends on PR 2 (`UserRepository`); largest unit |
| 4 | App wiring (`app.module.ts`, `main.ts`, health `@Public()`) + API E2E | PR 4 | Depends on PR 3; first point auth is reachable |
| 5 | Web auth (LoginPage, AuthProvider, ProtectedRoute, i18n, logo) | PR 5 | Depends on PR 4 (API contract live) |
| 6 | Docs (README, ADR-011 addendum) | PR 6 | Can fold into PR 5 if kept small |

Chain strategy confirmed: `stacked-to-main` — each PR merges to `main` in order before the next starts.

## Phase 0: Spike (blocking — run first)

- [x] 0.1 Write `argon2-password.hasher.spec.ts`: hash+verify a known password (argon2id, memoryCost 19456, timeCost 2, parallelism 1). If native binding fails on Windows, swap adapter to `@node-rs/argon2` before continuing. — native `argon2` binding works on this Windows machine; no swap needed.

## Phase 1: Shared Infra

- [x] 1.1 `shared/application/ports/id-generator.port.ts` — `IdGenerator` + `ID_GENERATOR` token.
- [x] 1.2 RED/GREEN `uuid-v7.id-generator.ts` — test v7 format + monotonic order, then implement (`uuid` v11 `v7()`).
- [x] 1.3 `shared/infrastructure/id/id-generator.module.ts` — `@Global()`.
- [x] 1.4 `shared/infrastructure/persistence/soft-deletable.repository.ts` — base class enforcing `deletedAt: null` default filter.
- [x] 1.5 `shared/presentation/decorators/public.decorator.ts` — `IS_PUBLIC_KEY`, `@Public()`.
- [x] 1.6 `shared/presentation/pipes/zod-validation.pipe.ts`.
- [x] 1.7 `packages/validation/src/auth/login.schema.ts` — `loginRequestSchema` (trim/lowercase before email check).

## Phase 2: Database

- [x] 2.1 `prisma/schema.prisma` — add `User` and `RevokedToken` models per Interfaces/Contracts.
- [x] 2.2 Run `prisma migrate dev` — first real migration.
- [x] 2.3 `prisma.config.ts` — add `migrations.seed` command.
- [ ] 2.4 `prisma/seed.ts` — DEFERRED to PR 3: `PASSWORD_HASHER`/`USER_REPOSITORY` don't exist until PR 3's `auth`/`users` modules; a stub that bootstraps DI but no-ops the actual seed would silently report success while inserting nothing (ADR-006: no fake/scaffolded code that pretends to work). `prisma.config.ts`'s `migrations.seed` command already points at this file — until PR 3 adds it, `prisma db seed` / the post-`migrate dev` seed hook fails loudly with a clear `Cannot find module` error, which is the intended, honest transitional state.

## Phase 3: `users` Module

- [x] 3.1 RED/GREEN `user.entity.ts` (domain).
- [x] 3.2 `application/ports/user.repository.port.ts` — `UserRepository` + `USER_REPOSITORY` (`findByEmail`, `save`).
- [x] 3.3 RED/GREEN `user.mapper.ts`.
- [x] 3.4 `prisma-user.repository.ts` extends `SoftDeletableRepository`; implement `findByEmail`/`save` (upsert, preserves `id` on update).
- [x] 3.5 Integration test: `PrismaUserRepository` against real test Postgres — excludes soft-deleted; second `save()` call updates not inserts, `id` unchanged.
- [x] 3.6 `users.module.ts`.

## Phase 4: `auth` Module — Application

- [ ] 4.1 `domain/invalid-credentials.error.ts`.
- [ ] 4.2 `application/ports/password-hasher.port.ts`, `token-issuer.port.ts`, `token-denylist.port.ts`.
- [ ] 4.3 RED/GREEN `login.use-case.ts` — cases: valid, wrong password, unknown email (dummy-hash path), soft-deleted (all identical failure).
- [ ] 4.4 RED/GREEN `logout.use-case.ts` — revokes `jti` via `TokenDenylist.revoke(jti, exp)`.
- [ ] 4.5 RED/GREEN `get-current-user.use-case.ts` — maps `req.user` to `{id,email}` only.

## Phase 5: `auth` Module — Infrastructure

- [ ] 5.1 `argon2-password.hasher.ts` — real hasher + pre-generated dummy-hash constant (same params).
- [ ] 5.2 `jwt-token.issuer.ts` — signs `{sub,email,jti}`, `jti` via `uuid` `v4()`.
- [ ] 5.3 RED/GREEN `prisma-token-denylist.adapter.ts` — `revoke()` as upsert keyed on `jti` (mocked Prisma test for idempotency).
- [ ] 5.4 Integration test: `PrismaTokenDenylistAdapter.revoke()` twice against real test Postgres — no unique-constraint error.
- [ ] 5.5 `auth.config.ts` — typed factory, throws on missing `JWT_SECRET`/`CORS_ORIGIN`.

## Phase 6: `auth` Module — Presentation

- [ ] 6.1 `dto/login-request.dto.ts`, `dto/auth-user-response.dto.ts`.
- [ ] 6.2 RED/GREEN `authenticated.guard.ts` — `@Public()` bypass, missing/expired/tampered cookie, valid-but-denylisted `jti`.
- [ ] 6.3 `decorators/current-user.decorator.ts`.
- [ ] 6.4 `auth.controller.ts` — `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; `@ApiBody` for Zod schema.
- [ ] 6.5 `auth.module.ts` — registers `APP_GUARD`.

## Phase 7: App Wiring

- [ ] 7.1 `health.controller.ts` — add `@Public()`.
- [ ] 7.2 `app.module.ts` — import `UsersModule`, `AuthModule`, `IdGeneratorModule`.
- [ ] 7.3 `main.ts` — `cookie-parser`, `enableCors({ origin: process.env.CORS_ORIGIN, credentials: true })`.

## Phase 8: API E2E

- [ ] 8.1 E2E (supertest, in-memory `USER_REPOSITORY`/`TOKEN_DENYLIST`): login→cookie→`/auth/me` 2xx; no cookie 401; `/health` public; logout then reuse 401; cross-origin request asserts CORS headers. Test bootstrap re-applies `cookie-parser`+`enableCors` explicitly.

## Phase 9: Web

- [ ] 9.1 `src/auth/AuthProvider.tsx` — context calling `GET /auth/me`.
- [ ] 9.2 RED/GREEN `src/auth/ProtectedRoute.tsx` — redirect to `/login` when unauthenticated.
- [ ] 9.3 RED/GREEN `src/pages/LoginPage.tsx` — required-field block, generic 401 message, renders logo (fetch mocked).
- [ ] 9.4 `apps/web/public/logo.svg` — placeholder wordmark.
- [ ] 9.5 `App.tsx` — `/login` route + `ProtectedRoute` wiring.
- [ ] 9.6 `i18n/locales/{en,es,ca}.json` — `auth.*` keys.

## Phase 10: Docs

- [ ] 10.1 `README.md` — new env vars, `prisma:migrate`, `prisma:seed`.
- [ ] 10.2 `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` — addendum (no Passport, 2h non-rotating expiry, no rate limiting).
