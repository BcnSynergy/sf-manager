# ADR-004: Multiplatform Frontend — React + React Native + Electron in a Shared Monorepo

## Status
Accepted

## Context
Three distinct client surfaces were identified during requirements
discussion:
1. **Web** — mainly for property management company employees: consulting
   review details across communities, listing overdue/missing reviews to
   send reminders, managing communities/companies/users.
2. **Mobile/tablet** — the actual field-use case: walking through a
   building checking extinguishers (and future inspectable elements)
   in situ.
3. **Desktop**.

## Decision
Three separate UI codebases — **React** (web), **React Native**
(mobile/tablet), **Electron** (desktop) — sharing business logic, the API
client, and TypeScript types/contracts through internal packages in a
monorepo. Monorepo tooling is **Turborepo on top of npm workspaces**,
matching the RM-Manager precedent.

npm workspaces provide the package linking (shared `node_modules`,
resolving internal packages like `packages/types` or `packages/api-client`
into `apps/web`, `apps/mobile`, `apps/desktop`, `apps/api`). Turborepo adds
the piece workspaces don't provide on their own: task orchestration and
caching across that dependency graph — running `build`/`lint`/`test` in
dependency order, skipping unaffected packages via incremental caching, and
scoping commands with `--filter`. With four apps and several shared
packages present from the very first walking-skeleton slice (not something
that grows in "later"), that orchestration problem exists from day one.

## Consequences
- Full native capability per platform (camera, offline storage, push
  notifications on mobile) — important for the field-checklist use case.
- Cost: three UI implementations instead of one, partially offset by shared
  logic/types packages. Mitigated by phased delivery — see ADR-006.
- Requires discipline to keep the shared packages (API client, domain
  types, validation schemas) as the single source of truth so the three UIs
  don't drift.

## Alternatives Considered
- **React + Capacitor (mobile) + Tauri (desktop)** wrapping a single web
  codebase — less UI duplication, but weaker native capability for a
  field-checklist app that will likely need offline support and camera
  access.
- **Flutter** (mobile/tablet/desktop) + separate React web admin — true
  single-codebase multiplatform for the non-web clients, but introduces
  Dart as a second language, breaking TypeScript continuity across the
  whole stack.
- **npm workspaces alone, no Turborepo** — simpler to start with, but loses
  dependency-graph-aware task orchestration and incremental caching from
  day one, when four apps and shared packages already exist. Rejected: this
  isn't complexity being added ahead of need, the need is already present
  at the walking-skeleton stage.
