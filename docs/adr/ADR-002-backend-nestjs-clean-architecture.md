# ADR-002: Backend — NestJS, Modular Monolith, Clean Architecture

## Status
Accepted

## Context
This project is explicitly also a vehicle to learn/practice a set of
technologies: Node.js + TypeScript backend, Clean Architecture, a modular
monolith organized by domain, and Spec Driven Development. A related prior
project (RM-Manager, currently paused) already validated NestJS as a
Clean Architecture + modular-monolith host, using module-first
(Screaming Architecture) folder structure rather than a global layer-first
structure.

## Decision
Backend is built with **NestJS**, organized as a **modular monolith**:
one module per business domain (communities, maintenance companies,
users, inspectable elements, review types, checklist questions,
reviews...), each module internally following Clean Architecture
layering (domain → application → infrastructure → presentation).
Folder structure is module-first, not a single global `domain/`
`application/` `infrastructure/` split. Data access specifics (ORM choice,
boundary enforcement) are covered separately in
[ADR-013](ADR-013-orm-prisma-strict-boundary.md).

## Consequences
- NestJS's built-in dependency injection removes the need for a manual
  composition root.
- Reusing a validated framework choice from RM-Manager narrows the "new
  tech" learning surface on the framework axis specifically, in favor of
  spending that learning budget on domain modeling, SDD process, and
  multiplatform delivery (see ADR-004).
- Module boundaries are drawn to keep the "Progressive Scalability" option
  open — extracting a module into its own service later should not require
  redesigning its internals, only its transport.

## Alternatives Considered
- **Fastify/Express + manual DI** — rejected: more scaffolding effort spent
  on wiring instead of on the architectural boundaries that are the actual
  learning goal here.
