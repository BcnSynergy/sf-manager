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

### Every domain slice includes its own UI (course correction, 2026-08-25)

`user-management-roles` and `community` both shipped API-only, deferring
web UI on two known domains — a drift from this ADR's own "thinnest
possible end-to-end slice = API + one client" premise. See ADR-006's
2026-08-25 addendum for the full record. Going forward:

- A new domain slice's SDD cycle (`sdd-propose`/`sdd-spec`/`sdd-design`)
  must include its **minimal** web UI in the same change, not as a
  separate later retrofit. "Minimal" still means minimal — no more UI
  than the slice's own success criteria require (ADR-006 discipline
  applies to UI scope exactly as it does to domain scope).
- Two retrofit slices are in flight to close the existing gap:
  `users-minimal-ui` (in progress) then `community-minimal-ui`. Only
  after both land does "new slice = domain + UI together" become the
  steady state with no backlog behind it.
- If a proposal is about to be written for API-only, ask explicitly
  whether that's deliberate (e.g. a pure backend-to-backend concern)
  before proceeding — don't let it happen silently again.

## Git & PR Conventions

Established across the `auth-minimal-skeleton`, `user-management-roles`,
and `community` PR chains — do not re-derive or improvise these:

- **Branch naming**: `<change-name>/<NN>-<slug>` (e.g.
  `community/07-soft-delete-cascade`), one branch per PR in a change's
  chain, branched from `main`.
- **PR title**: `type(scope): PR N/M — short description` (Conventional
  Commits type + scope, e.g. `feat(community): PR 7/11 — soft-delete
  cascade + representative Prisma adapter`). No issue-linking (`Closes
  #N`), no `type:*`/`status:*` labels, no PR template exists.
- **Chain strategy default**: `stacked-to-main` — each PR in a change's
  chain merges to `main` in order; there is no long-lived feature/tracker
  branch.
- The user-global `branch-pr` skill does **not** apply to this repo (it
  targets a different project's conventions: issue-linking, `type:*`
  labels, `type/description` branch naming, shellcheck). If it
  auto-loads, verify its rules against `.github/` contents (none exist
  here) before following it, and use the conventions above instead.
- Every PR gets an independent fresh-context review (a sub-agent with no
  prior conversation context, not a continuation) before push and before
  merge — confirmed explicitly with the user at each step, not assumed.
  This has repeatedly caught real bugs (DI-bootstrap crashes, error
  misclassification, vacuous concurrency tests) that inline review missed.

## Verifying UI Changes

Per the general rule to test UI changes in a real browser before calling
them done: once a PR in an active UI slice (`users-minimal-ui`,
`community-minimal-ui`, or any later one) touches `apps/web/**`, actually
start the dev server (`npm run dev` from the repo root runs both API and
web via Turborepo; `apps/web` alone via `npm run dev --workspace=apps/web`,
Vite) and exercise the feature in a browser (`claude-in-chrome` skill) —
golden path and the edge cases the slice's spec calls out — before
reporting the task complete. Passing unit/component/E2E tests verify
correctness, not that the feature actually works end-to-end in the app;
say so explicitly if a UI change was only test-verified, not
browser-verified.
