# Archive Report: auth-minimal-skeleton

**Date**: 2026-08-22
**Change**: auth-minimal-skeleton (Minimal Authentication Skeleton)
**Status**: CLOSED — ARCHIVED
**Artifact Store**: hybrid (engram + openspec)

## Summary

The `auth-minimal-skeleton` change has been successfully completed, verified with a PASS verdict, and archived. This was the first authentication slice for SF-Manager, implementing the minimal login/logout/session infrastructure needed to answer the core question: "is the request authenticated, yes/no?" across both API and web tiers.

## What Was Built

### Scope
- API: `users` + `auth` modules (2 new Nest modules, full ADR-002 layering)
- Database: `User` and `RevokedToken` Prisma models + first real migration
- Web: LoginPage, AuthProvider, ProtectedRoute, routing, i18n
- Shared infrastructure: IdGenerator (UUIDv7), SoftDeletableRepository, @Public() decorator, Zod validation

### Key Decisions (10 Architecture Decisions)
1. Split `users` + `auth` modules for ADR-002 compliance and FR-003 reusability
2. `@nestjs/jwt` only (no Passport) — simpler, reversible via the TokenIssuer port boundary
3. `uuid` v11 for UUIDv7 entity ids; shared IdGenerator port reused by all modules
4. Global `APP_GUARD` + `@Public()` opt-out — secure-by-default pattern
5. 2-hour JWT expiry, httpOnly cookie, environment-keyed CORS + SameSite flags
6. Email as login identifier (unique, natural, needed for password-reset later)
7. Soft-deleted users rejected via default repository filter
8. Logo asset at `apps/web/public/logo.svg` (placeholder, swappable)
9. Minimal deny-list for logout revocation (RevokedToken table, idempotent upsert on jti)
10. Dummy-hash timing mitigation (argon2id params synchronized at runtime, not hardcoded)

### Coverage
- **Spec**: 12/12 requirements verified with passing tests (login, failed-login, protected endpoints, session introspection, logout, public opt-out, CORS, soft-delete rejection, web form validation, web redirect, web logout, branding)
- **Tests**: 75 total passing (53 unit + 4 integration + 8 e2e API, 10 web)
- **Code**: All 39 tasks across 10 phases completed (6 stacked PRs, all merged to main)

## Verification Verdict

**PASS** — Complete

- All 12 spec requirements verified with passing covering tests
- All 10 architecture decisions implemented with zero drift
- All 39 tasks complete and spot-checked against live code
- All test suites green (75 tests total)
- Scope discipline confirmed (no out-of-scope features)
- 0 CRITICAL, 0 WARNING, 2 non-blocking SUGGESTIONs only

## Implementation History

### PR Timeline (stacked-to-main, all merged)
1. **PR 1** (auth-minimal-skeleton/01-spike-shared-infra): Spike (argon2 validation), shared infra (IdGenerator, SoftDeletableRepository, @Public, Zod pipe), database (User, RevokedToken models, migration, seed.ts)
2. **PR 2** (auth-minimal-skeleton/02-users-module): `users` module (entity, repository port, Prisma adapter, mapper)
3. **PR 3** (auth-minimal-skeleton/03-auth-module): `auth` module (application layer use cases, infrastructure adapters, presentation layer controller) — largest unit, plus review-fix round
4. **PR 4** (auth-minimal-skeleton/04-app-wiring-e2e): App wiring (app.module.ts, main.ts, health @Public), API E2E tests, critical toolchain fix for packages/validation CommonJS build
5. **PR 5** (auth-minimal-skeleton/05-web): Web auth (LoginPage, AuthProvider, ProtectedRoute, App.tsx routing, i18n keys, logo.svg, HealthPage logout)
6. **PR 6** (auth-minimal-skeleton/06-docs): Documentation (README env vars/migration/seed, ADR-011 addendum)

All PRs merged to main. Final implementation state confirmed live and tested.

## Artifacts Archived

### OpenSpec Location
- **Delta Spec Merged**: `openspec/changes/auth-minimal-skeleton/specs/authentication/spec.md` → `openspec/specs/authentication/spec.md` (main specs, capability-scoped)
- **Change Folder Moved**: `openspec/changes/auth-minimal-skeleton/` → `openspec/changes/archive/auth-minimal-skeleton/` (full artifact trail preserved)

### Files in Archive Folder
- `proposal.md` — original business case, scope, risks, rollback plan
- `design.md` — 10 architecture decisions, data flows, file changes, interfaces
- `specs/authentication/spec.md` — 12 requirements with scenarios (delta, merged to main)
- `tasks.md` — 39 tasks across 10 phases (all checked off)
- `exploration.md` — current-state analysis, approaches considered, open questions resolved
- `verify-report.md` — verification verdict (PASS), spec compliance matrix, architecture decision drift check
- `ARCHIVE-REPORT.md` — this file

### Engram Persistence
All artifacts saved with topic_key prefix `sdd/auth-minimal-skeleton/`:
- `proposal` (#56)
- `spec` (#57)
- `design` (#58)
- `tasks` (#61)
- `exploration` (#54)
- `apply-progress` (#63) — 6 PR details, 75 passing tests
- `verify-report` (#68) — PASS verdict
- `archive-report` (this save)

## Rollback
If rollback is ever needed:
1. Revert branch → drops auth/users modules, @Public patterns, IdGenerator
2. Run `prisma migrate reset` → removes User + RevokedToken tables
3. Remove `AuthModule` import from `app.module.ts` → restores fully open endpoints
4. No data migration needed (new tables, zero external dependencies)

## Next Steps
- The `authentication` capability is now the source of truth at `openspec/specs/authentication/spec.md`
- Future auth slices (refresh tokens, roles/RBAC, rate limiting) extend this spec; see ADR-011 addendum for the 3 deviations (no Passport, 2h non-rotating, no throttler yet) that remain reversible
- Ready for the next slice in the walking skeleton — not yet chosen, but likely a domain slice (communities, properties, inspections per FR-* roadmap)

## Metadata
- Change Name: `auth-minimal-skeleton`
- Project: `sf-manager`
- Artifact Store: `hybrid`
- Closed: 2026-08-22 (timestamp of this archive)
- First Change Archived: Yes (first change to reach PASS verdict and archive in this project)
