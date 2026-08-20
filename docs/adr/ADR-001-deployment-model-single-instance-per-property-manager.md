# ADR-001: Deployment Model — One Instance per Property Management Company

## Status
Accepted

## Context
The original request framed this as a tool for a single residential
community. During architecture discussion it became clear the real user
base is broader: property management company employees who administer
multiple communities and multiple maintenance companies, community
representatives who only handle their own community's inspections, and
maintenance company technicians who work across whichever communities their
company is assigned to.

An earlier assumption ("one VPS per community") was corrected once this
became clear — it did not support "a property management company employee
manages all communities."

## Decision
Each deployment (one VPS, one database) belongs to exactly **one property
management company**. Within that single instance, the company manages an
arbitrary number of communities and an arbitrary number of maintenance
companies. This is a one-to-many domain relationship inside a single-owner
install — **not** a multi-tenant SaaS architecture. There is no isolation
layer between different property management companies; each one gets its
own separate instance.

## Consequences
- No `tenant_id` / tenant-isolation plumbing anywhere in the domain or
  persistence layer — the "tenant" is the whole install.
- Simpler authorization model: scoping only needs to happen *below* the
  property-management-company level (see ADR-011), never across companies.
- If the product ever needs to serve multiple property management companies
  from one shared install, that is a new architectural boundary and requires
  its own ADR plus a migration — not assumed here.

## Alternatives Considered
- **One VPS per community** — rejected: doesn't support a property
  management company employee managing many communities from one login.
- **Full multi-tenant SaaS** (many property management companies sharing one
  instance with tenant isolation) — rejected as premature complexity; the
  deployment model (one VPS per company) makes it unnecessary.
