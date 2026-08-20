# ADR-015: Frontend and Cross-Cutting Tooling Defaults

## Status
Accepted

## Context
A handful of smaller tooling decisions were needed to actually scaffold
the monorepo, each with a fairly clear default given decisions already
made elsewhere.

## Decision
- **Web build tooling**: Vite + React Router, not Next.js — this is an
  authenticated, dashboard-style app with no SSR/SEO requirement; Next.js's
  server-components/routing model would add complexity without a matching
  benefit here.
- **Shared validation**: **Zod**, in a shared monorepo package, single
  source of truth for both backend validation and frontend forms —
  reusing the same precedent and reasoning as RM-Manager's ADR-043
  ("Zod replaces class-validator... single source of truth for frontend
  AND backend validation").
- **Testing**: **Jest** for the NestJS backend (native `@nestjs/testing`
  integration); **Vitest** for the React/Vite frontend (native Vite
  integration, faster, Jest-compatible API). Each package runs its own
  suite independently via Turborepo — no friction from mixing runners in
  one repo.
- **Node.js version**: pinned to the current Active LTS release **at
  scaffold time** — not fixed by this ADR to avoid documenting a version
  that may already be stale by the time it's read. Verified via
  nodejs.org/nvm when scaffolding begins; recorded in `.nvmrc` and
  `package.json` `engines`.

## Consequences
Conventional, low-risk choices — no significant downsides identified for
this project's scope.

## Alternatives Considered
- **Next.js** — rejected: no SSR/SEO need.
- **class-validator** — rejected: breaks single-source-of-truth validation
  across the multiple TypeScript clients.
- **One test runner for everything** — rejected: Jest and Vitest are each
  the more idiomatic choice for their respective ecosystem; Turborepo
  makes running both in one repo frictionless.
