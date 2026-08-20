# ADR-010: Soft Delete Strategy — Split by Data Kind

## Status
Accepted

## Context
Given the compliance nature of this data, deletion needs to be handled
deliberately rather than defaulting to hard delete everywhere. Verified
against [RIPCI Anexo II](../compliance/ripci-extinguisher-maintenance-program.md)
point 6: both the maintenance company and the installation's owner/occupant
must keep documentary evidence of the maintenance program for **at least
five years**. Careless hard deletion of review history would risk violating
that legal minimum.

## Decision
Two distinct policies, not one uniform rule:

**1. Reference/master data** (`Community`, `MaintenanceCompany`, `User`,
`InspectableElement`, `ChecklistQuestion`, `CommunityMaintenanceAssignment`):
soft-deletable via a uniform `deletedAt: Date | null` field. This is
**separate** from any entity-specific domain-state field an entity may
already have (e.g. `InspectableElement.active` for decommissioning) —
domain state describes a real-world event worth keeping fully visible
(this extinguisher was removed from the building), while `deletedAt`
describes an administrative correction (this record shouldn't exist,
e.g. a duplicate). Soft-deleted records are excluded from normal queries
by default but retained for referential integrity with historical
`ReviewSession`/`ElementReviewEntry`/`QuestionAnswer` records, and
recoverable by an admin.

**2. Compliance/audit records** (`ReviewSession` once `status != draft`,
and their `ElementReviewEntry`/`QuestionAnswer` children): **not deletable
at all**, soft or hard, once finalized — enforced at the domain layer, not
left to UI convention or discipline. `draft` sessions may be hard-deleted,
since they aren't real compliance records yet.

## Consequences
- Every repository/query for master-data entities must filter
  `deletedAt IS NULL` by default — a shared repository-base concern (e.g. a
  common repository interface/base class), not reimplemented per module,
  to avoid an easy-to-forget filter leaking soft-deleted records back into
  view.
- `deletedAt` as a timestamp (not a boolean) gives an audit trail (when)
  for free, and matches common ORM soft-delete conventions.
- The domain layer must actively refuse delete/hard-delete operations on
  non-draft `ReviewSession`s (and children) — this is a business rule, not
  just an absent DELETE endpoint, since it protects the RIPCI retention
  minimum.

## Alternatives Considered
- **Boolean `isDeleted`, or reusing `active` for everything** — rejected:
  loses the "when" a timestamp gives for free, and conflates domain state
  with administrative correction for entities that need both.
- **Hard delete everywhere** — rejected: breaks referential integrity with
  historical review records and risks violating RIPCI's 5-year documentary
  retention requirement.
- **Soft-delete for finalized compliance records too** — rejected: a
  "soft-deleted but technically still there" review record is a weaker
  compliance posture than "cannot be deleted at all." The domain layer
  should refuse the operation outright, not merely hide the record.
