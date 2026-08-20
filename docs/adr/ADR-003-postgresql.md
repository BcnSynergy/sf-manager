# ADR-003: PostgreSQL as the Database Engine

## Status
Accepted

## Context
Per ADR-001, each deployment is single-owner with a comparatively low data
volume (a handful of communities, their extinguishers/inspectable elements,
and quarterly-to-annual review records). Volume alone would not require a
full relational server. However, the project's explicit learning goals and
its planned Docker-based deployment (see future ADR on containerization)
favor practicing a real relational database over a zero-ops file database.

## Decision
**PostgreSQL**, run as a service in the same Docker Compose stack as the
API.

## Consequences
- Adds a DB service/container to operate (vs. SQLite's zero-ops single
  file) — acceptable given Docker Compose is already the deployment target.
- Gives headroom for the relational complexity already visible in the
  domain (communities, maintenance companies, users/roles, inspectable
  elements, review types, questions, reviews, answers) with real foreign
  keys and migrations, without an engine migration later if the domain
  grows further.

## Alternatives Considered
- **SQLite** — rejected: lower operational cost fits the data volume, but
  provides less value against the relational-modeling learning goal, and
  the domain already has enough entity relationships to benefit from real
  FK constraints and a migration tool.
