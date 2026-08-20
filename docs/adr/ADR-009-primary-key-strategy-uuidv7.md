# ADR-009: Primary Key Strategy — UUIDv7, Generated in the Application Layer

## Status
Accepted

## Context
Every entity's `id` was set as a standard UUID primary key. A fully random
UUID (v4) has a well-known downside as a B-tree-indexed primary key in
PostgreSQL: since values are inserted in random order, the index suffers
page splits, fragmentation, and worse cache locality than a monotonically
increasing key — a real performance/bloat cost as tables grow, unlike a
classic auto-increment integer.

## Decision
Every entity's `id` uses **UUIDv7** ([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)):
a 128-bit, UUID-formatted identifier with a leading 48-bit millisecond Unix
timestamp followed by random bits. Generated values are roughly
monotonically increasing over time — near auto-increment-like B-tree insert
locality — while staying globally unique without coordination, like UUIDv4.

Generation happens in the **application layer** (TypeScript, at entity
construction time), not as a Postgres-version-specific DB default. This
keeps ID assignment a domain/application-layer concern (an entity has its
`id` the moment it's constructed, before persistence — useful for domain
events referencing it), and avoids a hard dependency on PostgreSQL 18+'s
native `uuidv7()` function.

This does **not** change `InspectableElement.code` (ADR: see domain model
doc) — that stays a short, random, non-time-ordered public identifier on
purpose; embedding a timestamp there would leak registration order to
anyone reading a physical label.

## Consequences
- Better index locality/less bloat than UUIDv4 at scale.
- `id` values leak an approximate creation timestamp to anyone who can read
  them. Acceptable here since `id` is never the public-facing identifier
  (see `InspectableElement.code`); still a reason to avoid exposing raw
  `id`s in public-facing contexts generally.
- Needs a small application-layer UUIDv7 generator/library — one extra
  dependency, portable across Postgres versions.

## Alternatives Considered
- **UUIDv4** — rejected as a PK for the index-locality reason above; still
  the right shape for identifiers that specifically need to *not* be
  time-ordered (e.g. `InspectableElement.code`, which isn't a UUID at all
  though — see the domain model doc).
- **ULID** — same core idea (48-bit timestamp + randomness), predates
  UUIDv7, but isn't an actual UUID (different text encoding), so it doesn't
  map as cleanly onto Postgres's native `UUID` column type. UUIDv7 achieves
  the same goal as a real standard now, so there's no reason to reach for a
  non-standard alternative.
- **Auto-increment integers** — rejected: enumerable/leaks row counts, and
  doesn't fit a system designed around scoped access as well as a UUID.
