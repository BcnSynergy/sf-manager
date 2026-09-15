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
  company membership; *performing* reviews is scoped per-technician via a
  direct `(communityId, userId)` assignment (**corrected 2026-09-08** — see
  the addendum below; not a company-wide assignment inherited from
  `maintenanceCompanyId`) — but review **visibility** is narrower: only
  sessions where `performedById = self`. No CRUD on other users.
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

## Addendum (2026-09-08): `review-session` — Decision 3 made concrete, two roles made operational

The `review-session` change (FR-007) is the first slice to implement
Decision 3's "separate, composable check layered on top" of
`PermissionChecker` as a concrete mechanism, and the first to give
`MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` real, non-empty
permissions — both had mapped to `[]` in `ROLE_PERMISSIONS` since the
`user-management-roles` addendum above. This addendum records the shape
that shipped and corrects Decision 1's own stale text (now fixed in
place). Full rationale and alternatives:
`openspec/changes/archive/2026-09-08-review-session/design.md` Decisions
4-6, and `docs/architecture/domain-model-inspections.md`'s
"Community-to-technician scope" section.

1. **Resource scope is three composable layers, none of them inside
   `PermissionChecker`.**
   ```
   Layer 1  role → permission        PermissionsGuard + @RequirePermission   (unchanged, per Decision 3)
   Layer 2  user → community          CommunityScopeChecker port             (new, shared/application/authorization)
   Layer 3  user → this session       SessionAccess application service      (new, review-session module-local)
   ```
   `CommunityScopeChecker.isAssignedTo(userId, role, communityId):
   Promise<boolean>`
   (`shared/application/authorization/community-scope.checker.port.ts`) is
   the reusable Layer 2 primitive Decision 3 promised but did not design:
   any future resource that needs "is this user actively assigned to this
   community" gets it for free, without widening `PermissionChecker.can()`
   into a resource-aware check (the alternative Decision 3 explicitly
   rejected). Its one adapter (`AssignmentCommunityScopeChecker`, in
   `modules/community/infrastructure/authorization/`) dispatches on role —
   only `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` resolve to
   a real lookup; every other role is fail-closed `false` via an
   exhaustive `switch`.

   Layer 3 (`SessionAccess`, in
   `modules/review-session/application/services/session-access.service.ts`)
   is module-local, not reusable — it is the one place a `sessionId`
   becomes an aggregate, and it composes Layer 2 underneath it.
   `ReviewSessionRepository` was deliberately not given a bare
   `findById(id)`, so no use case can accidentally skip the scope check by
   calling around `SessionAccess`.

2. **`MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` become
   operational, identically.** `ROLE_PERMISSIONS`
   (`modules/auth/infrastructure/authorization/role-permission.checker.ts`)
   maps both roles to the same five permissions —
   `reviewSession:create/read/perform/complete/discard` — and nothing
   else. Holding one of these permissions grants nothing on a specific
   community without also passing the Layer 2 scope check;
   `PermissionChecker` and `CommunityScopeChecker` are deliberately two
   separate, AND-ed gates, not one merged check. `MANAGER` and
   `MAINTENANCE_COMPANY_MANAGER` remain fully inert (`[]`), unchanged by
   this slice.

3. **Correction to Decision 1: no `CommunityMaintenanceAssignment`.**
   Decision 1's `MAINTENANCE_TECHNICIAN` bullet originally described scope
   as "which communities their company is assigned to, per ADR-005's
   `CommunityMaintenanceAssignment` scoping" — that entity was **never
   built**. It does not exist in the shipped schema or codebase, and never
   has. The real, shipped mechanism is a direct per-technician
   `(communityId, userId)` assignment:
   ```prisma
   model CommunityTechnician {
     id            String    @id @db.Uuid
     communityId   String    @db.Uuid
     userId        String    @db.Uuid
     deactivatedAt DateTime? // NULL = active
     @@unique([communityId, userId])
   }
   ```
   exposed through `CommunityTechnicianRepository`, with
   `COMMUNITY_REPRESENTATIVE` mirroring it exactly via the sibling
   `CommunityRepresentative`/`CommunityRepresentativeRepository` pair.
   There is **no** company-to-community assignment at all: a technician's
   scope is the set of communities *that technician* is individually
   assigned to, never inherited from their `MaintenanceCompany`.
   `CommunityScopeChecker.isAssignedTo` reuses the same
   `findByCommunityAndUser` lookup at request time, returning `true` iff a
   row exists with `deactivatedAt === null` — so deactivating an
   assignment removes access on the very next request, with no cache to
   invalidate. Decision 1's bullet above is corrected in place to match.

## Addendum (2026-09-09): review-history-company-scope — a third scope-resolution path, and the first MAINTENANCE_COMPANY_MANAGER permission

The `review-history-company-scope` change (FR-008, third slice) is the
first to give `MAINTENANCE_COMPANY_MANAGER` an operational permission, and
the first to add a scope-resolution path to the review-session module that
is not `CommunityScopeChecker`. Full rationale: `openspec/changes/archive/`
(once archived) `review-history-company-scope/design.md`, Decisions 3-9.

1. **Layer 2 now has two ports, not one.** Extend the shipped three-layer
   table from the 2026-09-08 addendum above:
   ```
   Layer 2  user → community          CommunityScopeChecker port   (community module adapter)
   Layer 2  user → own company        CompanyScopeChecker port     (users module adapter)
   ```
   `CompanyScopeChecker.resolveCompanyScope(userId, role): Promise<string |
   null>` (`shared/application/authorization/company-scope.checker.port.ts`)
   is a sibling to `CommunityScopeChecker`, not a third branch of it — both
   are fail-closed, exhaustive on `Role`, and re-read per request with no
   cache. A `MAINTENANCE_COMPANY_MANAGER` resolves through the second and
   **never** through the first: routing them through `CommunityScopeChecker`
   would grant them exactly nothing, since they hold no community
   assignment. Its one adapter (`UserCompanyScopeChecker`, in
   `modules/users/infrastructure/authorization/`) dispatches on role —
   only `MAINTENANCE_COMPANY_MANAGER` ever resolves a non-null company;
   every other role is fail-closed `null` via an exhaustive `switch`, and
   the lookup excludes soft-deleted users (ADR-010).

2. **The review-session module has multiple access services and, now,
   three scope-resolution paths** — the deferred-twice record (proposal
   `review-session-company-scope`, then `review-history`, now settled
   here). `SessionAccessService` (write, performer-only, any status) and
   `ReviewHistoryAccessService` (read, completed-only, three scopes:
   performer, community, company) are siblings, a departure from
   `review-session`'s own design Decision 4's "one door" phrasing. The
   invariant that phrasing existed to protect is preserved **by the port,
   not by the service count**: `ReviewSessionRepository` still exposes no
   identifier-only read; all six history methods and `findByIdForPerformer`
   carry a performer, community or company scope as a required parameter.

3. **`MAINTENANCE_COMPANY_MANAGER` becomes operational** — `ROLE_PERMISSIONS`
   maps it to `['reviewSession:read']`, its first non-empty entry since the
   2026-08-22 addendum declared all four non-admin roles inert, and it
   delivers this ADR's Decision 1 promise of *"read access to every
   `ReviewSession` performed by any technician of their company"*. `MANAGER`
   stays `[]`; `SYSTEM_ADMIN` still holds no `reviewSession:*`; Decision 1's
   other two `MAINTENANCE_COMPANY_MANAGER` powers (scoped technician CRUD,
   onboarding/disabling) and Decision 2's `ManagerCapability` mechanism
   remain unbuilt.

4. **Attribution is frozen, not derived** — `ReviewSession.performedByCompanyId`
   snapshots the performer's maintenance company at creation, written once,
   with no update path. Decision 1's phrase *"performed by any technician of
   their company"* is therefore implemented as *"performed **on behalf of**
   their company"*: a technician who transfers does not move their past
   reviews to the new company, nor lose them from the old one. Backfill of
   pre-existing rows is best-effort from current employment at migration
   time — stated, accepted limitation, not a mechanism this ADR promises to
   correct later.

5. **Rejected, with the reason**: adding `maintenanceCompanyId` to the
   access token. A per-request database read costs one indexed lookup and
   matches how `role`'s own staleness is already accepted; a token claim
   would instead make the token a bearer of tenant scope with no revocation
   path shorter than its full lifetime, crossing a customer boundary rather
   than merely widening which endpoints one authorized session reaches. This
   is a **deliberate divergence** from how `role` is handled (accepted as
   stale in the 2026-08-22 addendum above) — a future reader MUST NOT
   "harmonize" the two without re-deciding the company case on its own
   merits.

## Addendum (2026-09-15): review-history-manager-capability — Decision 2's first implementation, and Decision 3's text superseded

The `review-history-manager-capability` change (FR-008, fifth and last
role-based visibility slice) is the first to implement any
`ManagerCapability` member and the first to give `MANAGER` a permission of
its own. Full rationale: `openspec/changes/archive/`
(once archived) `review-history-manager-capability/design.md`, Decisions
1-7.

1. **One declared member, not six.** Decision 2's enum names six
   capabilities; this slice declares and implements exactly one —
   `VIEW_ALL_REVIEWS` — as a Prisma enum with a single label, plus
   `User.managerCapabilities ManagerCapability[] @default([])`. The other
   five (`MANAGE_COMMUNITIES`, `MANAGE_MAINTENANCE_COMPANIES`,
   `MANAGE_CHECKLIST_CONTENT`, `MANAGE_INSPECTABLE_ELEMENTS`,
   `MANAGE_ORGANIZATION_PROFILE`) remain undeclared until their own
   slices (ADR-006) — the enum's shape is Decision 2's, its population is
   each slice's own.

2. **Decision 3's text is superseded, not merely extended.** Decision 3
   says `PermissionChecker` "resolves permissions from a static
   role→permission lookup table **plus the `managerCapabilities` flags
   above**" — implying capability-awareness inside `PermissionChecker`
   itself. That is not the shape this slice ships, and the sentence is
   corrected here rather than left to silently disagree with the code:
   `PermissionChecker.can(role, permission)` stays a pure, synchronous,
   static-table lookup — no user argument, no capability parameter, no
   database read, unchanged by this slice. The capability is instead
   resolved by a **separate Layer 2 port**,
   `ManagerCapabilityChecker.hasManagerCapability(userId, role,
   capability): Promise<boolean>`
   (`shared/application/authorization/manager-capability.checker.port.ts`),
   a sibling of `CompanyScopeChecker` and `CommunityScopeChecker` from the
   2026-09-08/2026-09-09 addenda above — fail-closed, exhaustive on
   `Role`, re-read per request, no cache. `ReviewHistoryAccessService`
   consults it directly in its `MANAGER` branch; `PermissionChecker` never
   sees it. This is the authoritative, current text: any future reader
   who finds Decision 3's original sentence should treat *this* addendum
   as controlling for the capability-resolution shape.

3. **Why a boolean return, parameterized by the capability — not a list.**
   Decision 2's signature is a list (`ManagerCapability[]`); the checker
   returns a boolean instead, taking the capability as a parameter:
   `hasManagerCapability(userId, role, 'VIEW_ALL_REVIEWS')`. An empty
   array is truthy in JavaScript, so a caller who wrote `if (caps)`
   instead of `if (caps.includes(X))` would fail **open** — exactly the
   risk this slice names as its top one (an inert role becoming the
   largest unscoped reader in the system). The boolean return closes that
   failure direction structurally; ADR-011's array *shape* is preserved by
   the `capability` **parameter**, not by the return type — each future
   capability is a new enum member and a new argument, never a second
   checker or a signature change.

4. **`MANAGER` becomes operational — one permission, capability-gated
   scope.** `ROLE_PERMISSIONS.MANAGER` becomes `['reviewSession:read']`,
   the role's first permission of any family since the 2026-08-22
   addendum declared it inert. Holding the permission grants **nothing**
   by itself: `ReviewHistoryAccessService`'s `MANAGER` branch resolves the
   capability first and returns `[]`/`null` before any repository call
   when it is absent, reusing `SYSTEM_ADMIN`'s unscoped
   `findCompletedAcrossInstallation` /
   `findCompletedByIdAcrossInstallation` pair verbatim when it is present
   — no new repository method, no new route. **Accepted, named
   consequence**: the same unconditional Layer 1 grant also widens two
   `GET` routes owned by `review-session-management` —
   `GET /review-sessions` and `GET /review-sessions/:sessionId` — from
   `403` to `200 []`/`404` for every `MANAGER`, granted or not, since
   neither route consults the capability. This is new read access nobody
   decided on before this slice's proposal; it is recorded here rather
   than silently absorbed into "the capability changes nothing outside
   review-history."

5. **Resolved fresh from the database, never the JWT.** Following the
   2026-09-09 addendum's reasoning for `maintenanceCompanyId` (and
   applying it at least as strongly to a security grant): the capability
   is read from the persisted `User` row on every request through
   `USER_REPOSITORY.findById`, which applies ADR-010's `deletedAt: null`
   filter for free. `Actor` gains no field. A revoke takes effect on the
   very next request, with no re-login and no grace period.

6. **Granting is edit-only, and clearing is stricter than
   `maintenanceCompanyId`'s.** `PATCH /users/:id` accepts an optional
   `managerCapabilities`; `POST /users` and `createUserSchema` do not, so
   a newly created `MANAGER` is always inert by construction. Unlike a
   stale `maintenanceCompanyId` (left untouched on a role change away from
   a maintenance role, per the 2026-09-08 addendum), a role change away
   from `MANAGER` **clears** `managerCapabilities` — a company is an
   identity fact the role requires; a capability is a privilege nobody
   re-consented to. No `user:grantCapability` permission exists: granting
   reuses the existing `user:update` gate, since no second trust tier
   holds `user:update` without capability-grant rights.

7. **No audit trail ships.** Consistent with Decision 5's already-deferred
   audit logging of `SYSTEM_ADMIN`/`MANAGER` writes — role changes are
   equally unaudited today, so this is existing precedent, not a new gap.

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
