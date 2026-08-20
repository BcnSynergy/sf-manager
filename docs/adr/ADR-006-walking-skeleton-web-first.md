# ADR-006: Delivery Strategy — Walking Skeleton, Web First

## Status
Accepted

## Context
Full scope is large for a solo project: three client platforms (ADR-004),
scoped RBAC (ADR-011), and several management domains (questions, review
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

## Addendum: Tactical DDD Design Timing
Value Objects, application-layer use cases, and detailed domain-entity
behavior (invariants, methods) are **not** designed exhaustively for the
whole domain upfront — that would be Big Design Up Front, the opposite of
this ADR's own premise. They're designed **per slice**, during that
slice's Spec Driven Development spec/design phases (`sdd-spec`/
`sdd-design`), scoped only to what that slice needs. The domain model doc
(`architecture/domain-model-inspections.md`) and the FR list are the right
level of upfront design for a walking skeleton: enough to scaffold the
monorepo correctly and see the shape of the whole system, not a full
tactical DDD design done before any code exists. Example: an entity field
already described richly in prose (e.g. `InspectableElement.code`'s
alphabet/uniqueness rules) becomes a real Value Object with a validating
factory when — and only when — the slice that needs it is specced.
