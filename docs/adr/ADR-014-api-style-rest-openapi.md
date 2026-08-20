# ADR-014: API Style — REST + OpenAPI

## Status
Accepted

## Context
The backend ([ADR-002](ADR-002-backend-nestjs-clean-architecture.md))
serves three clients: web, mobile/tablet, desktop
([ADR-004](ADR-004-multiplatform-frontend-monorepo.md)), all TypeScript.
REST, GraphQL, and tRPC were considered.

## Decision
**REST**, documented via `@nestjs/swagger` (OpenAPI spec auto-generated
from decorators — free interactive docs during development). Shared
TypeScript request/response types live in a shared monorepo package,
generated from or kept in sync with the OpenAPI spec — exact generation
tooling (e.g. `openapi-typescript`) decided at implementation time, not
fixed by this ADR.

## Consequences
- Most standard, best-documented approach for NestJS; most transferable
  skill for the project's learning goal.
- Free interactive API docs (Swagger UI) without extra effort beyond the
  decorators already needed for validation/DTOs.
- Slightly more manual type-sharing discipline than tRPC's automatic
  end-to-end inference — mitigated by the shared contracts package.

## Alternatives Considered
- **tRPC** — full end-to-end type safety without codegen, appealing given
  the all-TypeScript stack, but NestJS integration is community-maintained
  rather than official. Deferred, not rejected outright.
- **GraphQL** — flexible querying (useful for varied admin-dashboard
  views), but resolver/N+1-query complexity not justified for the walking
  skeleton's first slice ([ADR-006](ADR-006-walking-skeleton-web-first.md)).
