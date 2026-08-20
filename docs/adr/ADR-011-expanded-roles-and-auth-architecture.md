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
