# ADR-006: Delivery Strategy — Walking Skeleton, Web First

## Status
Accepted

## Context
Full scope is large for a solo project: three client platforms (ADR-004),
scoped RBAC (ADR-005), and several management domains (questions, review
types, inspectable elements, communities, users, maintenance companies),
with more requirements expected to surface as work progresses.

## Decision
Build a **walking skeleton** first: the thinnest possible end-to-end slice
(API + one client) covering the core flow, then grow both breadth (more
domains) and platform surface (mobile, desktop) incrementally — the
"Progressive Scalability" approach already used in RM-Manager.

**Web is the first client**, because it covers the widest set of
already-known specs (community, user, maintenance-company, question, and
review-type management) with the least platform-specific complexity — no
native packaging, no offline requirements yet.

## Consequences
- Mobile (the actual field-checklist use case) and desktop are deliberately
  deferred until the walking skeleton has validated the architecture
  (NestJS modules, scoped auth, PostgreSQL schema, API contracts) end to
  end.
- The generic "inspectable element" domain model (extinguishers today,
  other RIPCI-covered elements later — BIEs, emergency lighting, fire
  doors, etc.) is an open design question, intentionally not finalized in
  this ADR; it belongs to the design phase for the first walking-skeleton
  slice.

## Alternatives Considered
- **Mobile first** — rejected for the walking skeleton phase: the field
  checklist depends on the not-yet-designed generic inspectable-elements
  model and will likely need offline support, both of which would slow
  down validating the core architecture end to end.
