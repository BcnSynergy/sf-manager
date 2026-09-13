# ADR-016: Strict TDD Mode for sdd-apply / sdd-verify

## Status
Accepted

## Context
This project uses Spec-Driven Development (SDD): each domain slice goes
through `sdd-propose` → `sdd-spec`/`sdd-design` → `sdd-tasks` → `sdd-apply`
→ `sdd-verify` → `sdd-archive`. `sdd-init` (run 2026-08-21) detected that
both workspaces already had real test runners with existing test files —
Jest for `apps/api`, Vitest for `apps/web` (see ADR-015) — which, per the
SDD tooling's decision gate ("no marker/config but a test runner exists
→ default `strict_tdd: true`"), enabled **Strict TDD Mode** for this
project from day one.

Until now this was recorded only as tool state (Engram topic
`sdd-init/sf-manager`), not in `docs/adr/`. It governs how every slice
gets implemented and verified, so it belongs alongside the other process
and tooling ADRs (e.g. ADR-006, ADR-015) rather than living only in a
session-memory store that isn't versioned with the code.

## Decision
- **Strict TDD Mode is enabled** for this project.
- It applies only to the two execution phases of the SDD cycle:
  - `sdd-apply` — tasks must be implemented test-first (red → green →
    refactor), not test-after.
  - `sdd-verify` — must check for and report TDD-cycle evidence across
    the change's `apply-progress`, not just that tests exist and pass.
- It does **not** apply to the planning phases (`sdd-propose`, `sdd-spec`,
  `sdd-design`, `sdd-tasks`) — those produce documents, not code.
- The orchestrator is responsible for forwarding this mode explicitly
  into every `sdd-apply`/`sdd-verify` sub-agent prompt (looked up once
  per session from `sdd-init/{project}` and cached) — a sub-agent must
  never be left to discover or assume it on its own.
- Test commands per workspace: `npm run test --workspace=apps/api`
  (Jest) and `npm run test --workspace=apps/web` (Vitest run).

## Consequences
- Every implementation PR is expected to show a visible test-first cycle
  in its `apply-progress`/PR history, not just a final green suite —
  this is already how `inspectable-elements` (verify-report, 2026-09-02)
  was verified: "TDD Cycle Evidence present across all 11 apply-progress
  phases."
- Slower iteration per task than test-after, in exchange for catching
  design and edge-case problems before implementation locks them in —
  acceptable given this project's dual purpose (real use + learning).
- Depends on the orchestrator's forwarding step working correctly each
  session; if that lookup is skipped or lost (e.g. after compaction),
  `sdd-apply`/`sdd-verify` silently fall back to Standard Mode. This ADR
  makes the intended default explicit and checkable, independent of
  whether the Engram lookup happens to succeed in a given session.

## Alternatives Considered
- **Standard Mode (test-after)** — rejected: the project already had
  test runners and test files in place before any slice was built,
  which is precisely the condition the SDD tooling's own decision gate
  treats as a signal to default to strict TDD; overriding that default
  to skip it would have required an explicit reason, and none applied.
- **Leaving it undocumented (Engram-only)** — rejected: it's a binding
  process decision for every future slice, and Engram state isn't
  versioned in the repo or visible to someone reading the ADRs cold.
