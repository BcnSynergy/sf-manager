# ADR-013: ORM Strategy — Prisma, with a Strictly Enforced Clean Architecture Boundary

## Status
Accepted

## Context
NestJS + PostgreSQL + Clean Architecture ([ADR-002](ADR-002-backend-nestjs-clean-architecture.md))
needs a data-access layer. Prisma, Drizzle, and MikroORM were considered.
Prisma offers the strongest DX, tooling, and community, but has a known
risk in Clean Architecture contexts: its generated client is easy to let
leak into domain/application code, producing an anemic domain model built
directly around Prisma's generated types instead of real domain entities.

## Decision
**Prisma**, used exclusively inside infrastructure-layer repository
implementations. Concrete discipline rules — enforced, not just intended:

1. `PrismaClient` and any Prisma-generated type (`Prisma.XxxWhereInput`,
   etc.) must never appear in domain or application layer code — not in
   entities, not in use-case/service signatures, not in DTOs exposed to
   controllers.
2. Every module has hand-written domain entities (plain TS classes, zero
   Prisma dependency). Repository implementations map explicitly between
   Prisma's row-shaped query results and these domain entities — a
   dedicated mapper function/class per aggregate, not ad hoc inline
   mapping scattered across use cases.
3. Repository **interfaces** (ports) are defined in the application layer
   using only domain types; Prisma-backed implementations live in
   infrastructure and implement those interfaces — dependency inversion,
   never the reverse.
4. **Enforced at the tooling level**: an ESLint rule
   (`no-restricted-imports`, banning `@prisma/client` imports outside
   `infrastructure/persistence/**`) so a stray import fails lint/CI, not
   just gets missed in code review.

## Consequences
- More boilerplate than "use Prisma's client everywhere" (explicit mapper
  per entity) — accepted cost for a genuinely isolated domain layer.
- The lint rule is an automated guardrail, not a documentation-only
  convention — catches the mistake at commit time.
- `schema.prisma` is purely a persistence-layer artifact; it doesn't need
  to mirror the domain model's exact shape 1:1 (e.g. a domain value object
  can be flattened into scalar columns, reconstructed on read by the
  mapper).

## Alternatives Considered
- **Drizzle** — more explicit, SQL-like, less "magic," but less mature
  tooling/community than Prisma. Deferred, not rejected outright.
- **MikroORM** — natively DDD-aligned (Unit of Work, Identity Map), the
  closest philosophical fit to Clean Architecture out of the box, but a
  smaller ecosystem. Deferred — Prisma's DX/community advantage plus the
  ESLint-enforced boundary addresses the main objection to using it here.
