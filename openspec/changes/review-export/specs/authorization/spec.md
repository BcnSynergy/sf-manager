# Delta for Authorization

> **Purpose amendment (for archive):** the capability's rule that no
> permission family may be widened to reach the organization profile
> gains exactly one narrow exception: the review-document read exposes
> six letterhead fields to any caller already holding `reviewSession:read`,
> through the scoped `review-document` read only. No permission,
> `Permission` member, `ROLE_PERMISSIONS` row or capability is added.
> Nothing else in the authorization story changes.

## MODIFIED Requirements

### Requirement: The Organization Profile Grants Nothing Beyond Itself

The new family MUST widen nothing. The four non-admin rows of
`ROLE_PERMISSIONS` MUST be **unchanged** by this change — each still
holding exactly what it held before, with `MANAGER` and
`MAINTENANCE_COMPANY_MANAGER` still exactly `['reviewSession:read']`.
Holding `organizationProfile:*` MUST confer nothing on any other
surface, and no other permission family MUST be widened to reach the
profile, with exactly **one** exception: the review-document read
(`review-document`, gated by the existing `reviewSession:read`
permission) MAY return the organization profile's six letterhead
fields — `name`, `legalName`, `taxId`, `address`, `phone`, `email` — to
a caller holding no `organizationProfile:*` permission. That exception
MUST NOT extend to `id` or `logoAssetId`, MUST NOT add any
`organizationProfile:*` member to any row of `ROLE_PERMISSIONS`, MUST
NOT create a new `Permission` member, `ROLE_PERMISSIONS` grant or
capability, and MUST NOT be reachable other than through the scoped
review-document read itself.

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
(Previously: no other permission family MUST be widened to reach the
profile, with no exception. The scenario *The admin's other permissions
are untouched* compared the `SYSTEM_ADMIN` entry against the change that
introduced `organizationProfile:*`; it now compares it against this
change, which alters no permission row.)

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
- THEN the entry MUST be identical, still including `organizationProfile:read` and `organizationProfile:update`, with no permission removed and none added

#### Scenario: No profile edit is audited
- GIVEN the schema, the domain events and the write paths after this change
- WHEN they are inspected for an audit trail of profile edits
- THEN no audit table, audit event or audit write MUST exist

#### Scenario: The one exception is exactly the six letterhead fields
- GIVEN a `MAINTENANCE_TECHNICIAN` holding no `organizationProfile:*` permission, reading the document of a `completed` session in their scope
- WHEN the response's letterhead is inspected
- THEN it MUST carry exactly the six letterhead fields — `name`, `legalName`, `taxId`, `address`, `phone`, `email` — and MUST NOT carry `id` or `logoAssetId`

#### Scenario: No permission is added to reach the exception
- GIVEN the `Permission` union and `ROLE_PERMISSIONS` before and after this change
- WHEN they are compared
- THEN they MUST be identical, and no `organizationProfile:*` member MUST appear on any non-admin row

#### Scenario: The exception is unreachable outside the scoped read
- GIVEN a caller holding `reviewSession:read` but not in scope for a given session, or holding `reviewSession:read` with no session context at all
- WHEN they attempt to reach the organization profile's letterhead fields other than through that session's review-document read
- THEN no route or use case MUST return them

### Requirement: Installation-Wide Review History Scope for a Manager Holding VIEW_ALL_REVIEWS

A `MANAGER` holding `reviewSession:read` **and** the `VIEW_ALL_REVIEWS`
capability MUST be granted history visibility over **every** `completed`
review session in the installation — the **same** scope
*Installation-Wide Review History Scope for a System Admin* grants, with
no difference of any kind. Every condition in that requirement's table
MUST hold identically for this actor: no community assignment and no
maintenance company is involved, and a session whose community, company
or performer has been deactivated or soft-deleted, or which carries no
performing-company attribution at all, MUST **still be visible**.
`VIEW_ALL_REVIEWS` means literally everything.

The capability MUST widen **nothing else**. It MUST confer no
administrative permission, no review-session write access, no
user-management access, and no per-company, per-community or date-bounded
variant of the read. It MUST affect the review-history read surface and
nothing else in the system — which now, by construction, includes the
review-document read: `review-document` reuses this capability's
review-history scope resolution without widening it, so a granted
manager's document visibility is exactly the review-document read
inheriting this same history scope, not a second grant.

Scope MUST still be evaluated in addition to, never instead of, the
role/permission check, and authentication MUST still be evaluated before
both. The `completed` status filter MUST still apply: a `draft` MUST NOT
be listed and MUST NOT be readable by id for this actor either. This
grant MUST apply to history **reads** only — the lists and the by-id read
alike.
(Previously: "It MUST affect the review-history read surface and nothing
else in the system", with no mention of the review-document read.)

#### Scenario: A granted manager sees every completed session in the installation
- GIVEN completed sessions attributed to two different maintenance companies, on two different communities, performed by different technicians, and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they request review history
- THEN the response MUST be 2xx and MUST contain every one of those sessions

#### Scenario: The granted manager's result equals the admin's, session for session
- GIVEN the same installation, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN both request the history list
- THEN both results MUST contain exactly the same sessions in exactly the same order

#### Scenario: Deleted and deactivated context hides nothing from the granted manager
- GIVEN a `completed` session whose community has been deactivated or soft-deleted, one whose attributed company has been soft-deleted, and one carrying no attributed company at all
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests the list and each of those sessions by id
- THEN all three MUST be listed and each by-id request MUST return its full recorded record

#### Scenario: The granted manager reads any completed session by id unconditionally
- GIVEN any `completed` session in the installation, performed by anyone, on any community, for any company
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests it by id
- THEN the request MUST succeed and MUST return the same recorded record the performer would see, with no scope condition evaluated against the actor

#### Scenario: Drafts and unknown ids still 404 for the granted manager
- GIVEN a `draft` session and a well-formed session identifier matching no session at all
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests each in turn through the history detail read
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND` with identical status, error code and message

#### Scenario: The capability widens nothing outside the history read
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they call any administrative endpoint — users, communities, maintenance companies, inspectable elements, checklist questions, review templates — and any review-session write endpoint
- THEN every response MUST be 403, and the capability MUST NOT appear in any authorization decision outside the review-history read

#### Scenario: Unauthenticated caller is rejected before the role and capability checks
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls any history endpoint
- THEN the response MUST be 401, and neither the permission check nor the capability resolution MUST execute

#### Scenario: The capability governs the review-document read too, through the same scope
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` and a `completed` session anywhere in the installation
- WHEN they read that session's document
- THEN the response MUST be 2xx, granted through the same history scope this capability already establishes, with no separate document-specific grant
