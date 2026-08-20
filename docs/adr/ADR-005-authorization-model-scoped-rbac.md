# ADR-005: Authorization Model — Role-Based Access Control, Scoped by Resource

## Status
Accepted

## Context
Three user roles were identified:
- **Property management company employee** — manages every community and
  every maintenance company registered in the instance.
- **Community representative** — the original user from the initial
  request; only has access to their own community's data.
- **Maintenance company technician** — has access to the communities their
  maintenance company is currently assigned to (a many-to-many
  company↔community assignment).

A flat role → permission matrix is not enough on its own: two roles
(representative, technician) need their visible data further **scoped** to
a subset of communities, and that subset is dynamic for technicians (it
changes as their company's assignments change).

## Decision
Authorization combines **role** (which actions a role may perform) with a
**resolved resource scope** (which communities/companies a given user may
see), rather than a flat permission matrix:
- Admin role (property management employee) → global scope (all
  communities, all maintenance companies).
- Representative role → fixed scope: exactly one community.
- Technician role → dynamic scope: the set of communities currently
  assigned to their maintenance company.

Scope resolution must be a single, consistent domain-layer concern (e.g. an
authorization policy/guard applied uniformly to every community/company-
scoped query), not scattered ad hoc checks per endpoint.

## Consequences
- Every query that touches community- or company-scoped data must run
  through scope resolution, not just a role check — this needs to be
  designed once and reused, not reimplemented per module.
- A **demo mode** (config flag that disables login and grants the highest
  role) was also requested for testing/demos. This is a security-sensitive
  feature and must be strictly environment-gated (only enabled via an
  explicit non-production configuration) — recorded here as a hard
  constraint to be captured in a future security NFR.

## Alternatives Considered
- **Flat RBAC without scoping** — rejected: cannot satisfy "a representative
  only sees their own community" or "a technician only sees their company's
  assigned communities."
