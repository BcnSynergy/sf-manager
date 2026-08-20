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
monorepo. Monorepo tooling defaults to **Turborepo** (npm workspaces),
matching the RM-Manager precedent, pending confirmation.

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
