# SF-Manager — Working Rules

## Walking Skeleton Discipline (ADR-006)

This project is built as a walking skeleton, grown one thin end-to-end
slice at a time — not designed exhaustively upfront. Apply this rule
actively, not just as background context:

- Before adding scope, a new entity field, a new use case, or a new
  Value Object, ask: **does the current slice actually need this?** If
  not, note it (in the relevant ADR's "Open questions" or the FR list)
  and defer it — don't design or build it now.
- Value Objects, application-layer use cases, and detailed entity
  behavior are designed **per slice**, during that slice's `sdd-spec`/
  `sdd-design` phases — never as a big upfront design pass across the
  whole domain (see ADR-006's addendum).
- If a conversation starts drifting into designing multiple future
  slices at once, say so explicitly and redirect back to the slice
  actually in progress.
- Full architecture context lives in `docs/adr/` (start at
  `docs/adr/INDEX.md`) and `docs/architecture/domain-model-inspections.md`.
