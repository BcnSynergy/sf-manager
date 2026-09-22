# Delta for Authorization

> **Purpose amendment (for archive):** the capability gains one more
> `SYSTEM_ADMIN`-only administrative family, `organizationProfile:*`. The
> authorization story is unchanged in every other dimension: the same
> guard order, the same `PermissionChecker.can` signature, no capability
> mechanism touched, and the four non-admin rows of `ROLE_PERMISSIONS`
> unchanged. The one thing worth recording is the **granularity**: this
> family declares **two** members, not the customary four, because the
> resource has no create and no delete verb to guard.

## ADDED Requirements

### Requirement: Permission Check on Organization Profile Endpoints

The system MUST check the caller's role before allowing access to the
`/organization-profile` endpoints. Only `SYSTEM_ADMIN` MUST be
permitted; the other 4 roles MUST be rejected with 403. Authentication
MUST be evaluated before this check: a request without a valid session
MUST receive 401 even if the requested action would otherwise require
role rejection (403).

The `Permission` union gains exactly `organizationProfile:read` and
`organizationProfile:update` — **two** members, not four. No
`organizationProfile:create` and no `organizationProfile:delete` MUST be
declared, because no create and no delete endpoint exists to guard
(`organization-profile-management`, *The Profile Has No Create and No
Delete Surface*); declaring them would be a permission with no call
site. Both MUST be granted only on the `SYSTEM_ADMIN` row of
`ROLE_PERMISSIONS`. The read endpoint MUST require
`organizationProfile:read` and the update endpoint MUST require
`organizationProfile:update`; neither MUST be reachable on
authentication alone.

`ROLE_PERMISSIONS` MUST remain an exhaustive `Record<Role, Permission[]>`,
and `PermissionChecker.can(role, permission)`'s signature MUST be
unchanged — no user, capability or resource argument, and no database
read.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call an `/organization-profile` endpoint
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Every non-admin role is rejected on both endpoints
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE`
- WHEN they call the organization-profile read endpoint and then the update endpoint
- THEN both responses MUST be 403, for each of the four roles, with no profile data disclosed and no write performed

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls either `/organization-profile` endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

#### Scenario: Each endpoint declares its own permission
- GIVEN the two organization-profile routes' permission metadata
- WHEN it is inspected
- THEN the read MUST require `organizationProfile:read`, the update MUST require `organizationProfile:update`, and neither MUST be reachable on authentication alone

#### Scenario: Exactly two members are declared and only the admin holds them
- GIVEN the `Permission` union and `ROLE_PERMISSIONS` after this change
- WHEN the `organizationProfile:*` family is enumerated
- THEN it MUST contain exactly `organizationProfile:read` and `organizationProfile:update`, with no create or delete member, and only the `SYSTEM_ADMIN` row MUST hold either

### Requirement: The Organization Profile Grants Nothing Beyond Itself

The new family MUST widen nothing. The four non-admin rows of
`ROLE_PERMISSIONS` MUST be **unchanged** by this change — each still
holding exactly what it held before, with `MANAGER` and
`MAINTENANCE_COMPANY_MANAGER` still exactly `['reviewSession:read']`.
Holding `organizationProfile:*` MUST confer nothing on any other
surface, and no other permission family MUST be widened to reach the
profile.

No `ManagerCapability` member MUST be declared for this slice: in
particular `MANAGE_ORGANIZATION_PROFILE`, which ADR-011 Decision 2
names and *The Deferred Review Visibility Scopes Grant Nothing* holds
undeclared, MUST still appear nowhere in `apps/**` or `packages/**`, and
the `ManagerCapability` enum MUST still declare exactly one member,
`VIEW_ALL_REVIEWS`. FR-013's `MANAGER` half stays deferred to its own
slice on purpose.

No audit trail of profile edits MUST ship: no table, no event, no
write — consistent with ADR-011 Decision 5, under which role changes are
equally unaudited today.

#### Scenario: The four non-admin rows are unchanged
- GIVEN `ROLE_PERMISSIONS` before and after this change
- WHEN the `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` entries are compared
- THEN each MUST be identical to what it was, with `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` still exactly `['reviewSession:read']` and no `organizationProfile:*` member anywhere among the four

#### Scenario: The capability is still undeclared
- GIVEN the user model, schema and authorization code after this change
- WHEN they are searched for `MANAGE_ORGANIZATION_PROFILE`
- THEN it MUST NOT appear anywhere in `apps/**` or `packages/**`, and `ManagerCapability` MUST still declare exactly one member, `VIEW_ALL_REVIEWS`

#### Scenario: The admin's other permissions are untouched
- GIVEN the `SYSTEM_ADMIN` entry before and after this change
- WHEN they are compared
- THEN the only difference MUST be the addition of `organizationProfile:read` and `organizationProfile:update`, with no permission removed and none other added

#### Scenario: No profile edit is audited
- GIVEN the schema, the domain events and the write paths after this change
- WHEN they are inspected for an audit trail of profile edits
- THEN no audit table, audit event or audit write MUST exist
