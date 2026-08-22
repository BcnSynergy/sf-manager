# ADR-011: Expanded User Roles and Authentication/Authorization Architecture

## Status
Accepted — Supersedes [ADR-005](ADR-005-authorization-model-scoped-rbac.md)

## Context
ADR-005 defined three roles (`ADMIN`, `COMMUNITY_REPRESENTATIVE`,
`MAINTENANCE_TECHNICIAN`) with resource-scope resolution, but no
permission granularity within a role. Further requirements gathering
revealed richer real-world structure:
- The property management company side has two distinct trust levels: a
  system administrator with unrestricted access, and managers whose exact
  capabilities should be configurable per person based on trust/training.
- The maintenance company side has two distinct roles: a company manager
  (onboards/disables their own technicians, sees all their company's
  review history) and a plain technician (performs reviews, sees only
  their own).
- Whether to build a fully granular (resource × action) permission system
  was explicitly raised, since it would let a `SYSTEM_ADMIN` calibrate
  exactly what each manager can do — at the cost of meaningfully more
  implementation effort.
- The app handles personal data of residents and technicians (GDPR-
  relevant, Spain/EU) — authentication/authorization needs deliberate
  security choices, not defaults.

## Decision

### 1. Expanded role enum
`SYSTEM_ADMIN | MANAGER | MAINTENANCE_COMPANY_MANAGER |
MAINTENANCE_TECHNICIAN | COMMUNITY_REPRESENTATIVE`, replacing ADR-005's
`ADMIN | COMMUNITY_REPRESENTATIVE | MAINTENANCE_TECHNICIAN`.

- **`SYSTEM_ADMIN`**: unrestricted, global scope, can manage all users of
  every role.
- **`MANAGER`**: property management company employee with a small, named
  set of capability flags (below) — not full user management.
- **`MAINTENANCE_COMPANY_MANAGER`**: scoped to their `maintenanceCompanyId`.
  CRUD on that company's `MAINTENANCE_TECHNICIAN` users (onboarding/
  disabling — disabling is `deletedAt` per ADR-010, never a hard delete of
  a technician who has performed reviews). Read access to every
  `ReviewSession` performed by any technician of their company.
- **`MAINTENANCE_TECHNICIAN`**: scoped to their `maintenanceCompanyId` for
  *performing* reviews (which communities their company is assigned to,
  per ADR-005's `CommunityMaintenanceAssignment` scoping) — but review
  **visibility** is narrower: only sessions where `performedById = self`.
  No CRUD on other users.
- **`COMMUNITY_REPRESENTATIVE`**: unchanged from ADR-005 — full access to
  their own community's data, performs quarterly reviews.

### 2. MANAGER capability flags — small named set, not a full permission matrix
`User.managerCapabilities?: ManagerCapability[]` (meaningful only when
`role = MANAGER`), a fixed, small, code-level enum:
- `MANAGE_COMMUNITIES` (FR-001)
- `MANAGE_MAINTENANCE_COMPANIES` (FR-002)
- `MANAGE_CHECKLIST_CONTENT` (FR-005 pool + FR-005b templates, bundled —
  not split further)
- `MANAGE_INSPECTABLE_ELEMENTS` (FR-004, admin side)
- `VIEW_ALL_REVIEWS` (FR-008 across every community)
- `MANAGE_ORGANIZATION_PROFILE` (FR-013, added by
  [ADR-012](ADR-012-property-management-company-profile-entity.md) — the
  property management company's own corporate profile used on reports)

Deliberately **excludes** user management (FR-003) from the assignable
set — creating/modifying other users' access stays `SYSTEM_ADMIN`-only,
since it's privilege-escalation-sensitive, not data-management.

### 3. Authorization architecture — isolate the permission decision
Every authorization check goes through a single application-layer port,
`PermissionChecker`, invoked via a permission-named guard/decorator (e.g.
`@RequirePermission('checklistQuestion:write')`) — never a scattered
`if (user.role === X)` check in a controller. Today `PermissionChecker`
resolves permissions from a static role→permission lookup table plus the
`managerCapabilities` flags above. This keeps a fully dynamic, DB-backed
permission system reachable later as an internal swap behind the same
port, without touching any controller or use case. Resource **scope**
(which communities/companies, and for reviews, which actor) stays a
separate, composable check layered on top, per ADR-005's original
scope-resolution model.

### 4. Authentication
JWT access token (short-lived, ~15 min) + rotating refresh token, via
NestJS + Passport (`passport-jwt`). Password hashing: **argon2id** (not
bcrypt) — stronger against GPU/ASIC cracking, current OWASP
recommendation. Refresh tokens: httpOnly + Secure + SameSite cookie for
the web client; OS-level secure storage (Keychain/Keystore via React
Native, `safeStorage` via Electron) for mobile/desktop — never plain
`localStorage`. Login endpoint rate-limited (`@nestjs/throttler`) against
brute force.

### 5. Sensitive-data follow-ups (not blocking the walking skeleton)
Audit logging of authentication events and `SYSTEM_ADMIN`/`MANAGER`
writes; MFA for `SYSTEM_ADMIN` accounts specifically. Tracked as future
FRs, not designed here.

## Consequences
- Role enum grows from 3 to 5 values; every existing ADR-005/domain-model
  reference to the old roles is updated in this pass.
- `MAINTENANCE_TECHNICIAN` review visibility is now narrower than ADR-005
  originally implied (own sessions only) — `MAINTENANCE_COMPANY_MANAGER`
  is the one with company-wide visibility.
- The `PermissionChecker` port adds one layer of indirection today for a
  flexibility need that doesn't fully exist yet — a deliberate, low-cost
  hook for Progressive Scalability, not speculative over-engineering,
  since swapping the underlying rule source later costs nothing at the
  call sites.
- argon2id and rotating refresh tokens are more setup than bcrypt plus a
  single long-lived JWT, justified by the data being personal data of
  residents/technicians under GDPR.

## Addendum (2026-08-21): `auth-minimal-skeleton` walking-skeleton deviations

The `auth-minimal-skeleton` change (ADR-006 walking skeleton) implemented
the first end-to-end login/logout slice against this ADR. It deliberately
deviates from Decision 4 (Authentication) in three ways, each scoped to
this slice and reversible without a rewrite. This addendum documents the
deviations and their rationale; it does not revise the decision above —
Passport, refresh-token rotation, and rate limiting remain the target
shape.

1. **`@nestjs/jwt` used directly, without Passport (`passport-jwt` /
   `@nestjs/passport`).** The login guard is a single `AuthenticatedGuard`
   class behind a `TokenIssuer` port (`sign`/`verify`), not a Passport
   strategy. Passport would add four dependencies and a custom cookie
   extractor to answer one boolean ("is this cookie a valid, non-revoked
   token?"). Reversible: swapping `AuthenticatedGuard`'s body for
   `AuthGuard('jwt')` later touches no controller, no `@Public()`
   decorator, and no use case — the port boundary absorbs the change.

2. **A single non-rotating access token (2h expiry) instead of the
   access+refresh rotation described in Decision 4.** No refresh token
   exists yet, so a 15-minute expiry (as originally specified) would mean
   constant manual re-login with nothing to silently renew the session;
   2 hours bounds a non-revocable-by-expiry token to roughly one working
   session instead. The token is still delivered via an httpOnly cookie
   (`sf_access_token`), matching Decision 4's eventual delivery mechanism
   for the web client — adding a refresh endpoint later extends this
   cookie-based flow rather than replacing it. Logout revokes the current
   token explicitly via a minimal server-side deny-list (`RevokedToken`
   table keyed on the token's `jti`), so at least explicit logout is not
   purely wall-clock-bound.

3. **No rate limiting (`@nestjs/throttler`) on the login endpoint yet.**
   Decision 4 calls for it; this slice ships without it. This is an
   accepted, time-boxed brute-force exposure window on `POST /auth/login`,
   revisited alongside the refresh-token slice rather than blocking this
   walking skeleton on it.

For completeness, not as a deviation: this slice implements a single
authenticated-yes/no guard with none of this ADR's five-role scoped RBAC
model (`SYSTEM_ADMIN`/`MANAGER`/etc.) or `PermissionChecker` port yet.
That is not a deviation from this ADR's authentication decision — it is
the walking-skeleton scoping principle from ADR-006's addendum, and
authorization is added per-entity in later slices as they need it.

## Addendum (2026-08-22): `user-management-roles` walking-skeleton deviations

The `user-management-roles` change (ADR-006 walking skeleton) implemented
the first `SYSTEM_ADMIN`-only slice of user management and authorization
against this ADR's Decisions 1, 3, and 4. It confirms two deliberate,
scoped deviations already implied by Decision 4's addendum above, and
extends them with the design decisions made for this slice.

1. **Role staleness in the access token is accepted, not closed, in this
   slice.** `role` is signed into the access token at login and returned
   as-is by `GET /auth/me` — the token is not re-verified against the
   database on every request. If a `SYSTEM_ADMIN` changes another user's
   role via `PATCH /users/:id`, that user's already-issued token keeps
   authorizing on the OLD role until it expires (bounded by the
   `auth-minimal-skeleton` addendum's 2h access-token lifetime) or the
   user logs out. This is the same tradeoff the `auth-minimal-skeleton`
   addendum already accepted for revocation (no `TokenDenylist` /
   `userId` index for bulk invalidation) — extended here to cover role
   changes, not only logout. **Rejected**: reusing `TokenDenylist` to
   force re-authentication on every role change (no `userId` column to
   bulk-invalidate by user, same gap already documented above); a new
   per-user invalidation epoch (`User.sessionsValidFrom`). Both are
   deferred, tracked as the same follow-up: introduce the epoch alongside
   refresh tokens, at which point role changes can invalidate the
   affected user's active sessions without a new mechanism.

2. **Four of the five declared roles (`MANAGER`,
   `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`,
   `COMMUNITY_REPRESENTATIVE`) are declared in the `Role` enum and the
   `PermissionChecker`'s rule table, but carry zero operational
   permissions in this slice.** `ROLE_PERMISSIONS: Record<Role,
   Permission[]>` maps each of the four to `[]` explicitly — not omitted,
   not defaulted, not inferred — so the exhaustive `Record` type forces
   every future permission or role addition to reconsider each one
   instead of silently forgetting it. Only `SYSTEM_ADMIN` can reach
   `POST/GET/PATCH/DELETE /users` in this slice; the other four roles
   authenticate successfully (login and `/auth/me` work for any role) but
   are authorized for nothing beyond that. Decision 2's `MANAGER`
   capability-flag model (`managerCapabilities`) and the scoped CRUD
   described for `MAINTENANCE_COMPANY_MANAGER` are **not implemented
   yet** — this slice only proves the guard/checker seam end-to-end for
   one role, per the ADR-006 walking-skeleton scoping principle. Each
   inert role becomes operational in its own later slice, adding entries
   to `ROLE_PERMISSIONS` rather than changing the authorization
   architecture itself.

## Alternatives Considered
- **Full granular resource×action permission matrix, admin-configurable
  roles** — not rejected outright, deferred: more implementation effort
  for a need that, at current scale (one property management company, a
  handful of managers), is satisfied by 5 named capability flags. The
  `PermissionChecker` port keeps this reachable later without a rewrite.
- **Reusing `MAINTENANCE_TECHNICIAN` with a boolean `isManager` flag** —
  rejected: conflates two roles with materially different permissions
  (CRUD on other users vs none) into one role plus a flag — exactly the
  kind of implicit branching `PermissionChecker` is meant to avoid.
- **bcrypt** — rejected in favor of argon2id, the stronger, current
  standard for this threat model.
