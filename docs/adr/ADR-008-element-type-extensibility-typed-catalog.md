# ADR-008: Inspectable Element Type Extensibility — Code-Level Typed Catalog

## Status
Accepted

## Context
The domain needs to support extinguishers today and other RIPCI-regulated
elements later (BIEs, emergency lighting, fire doors, smoke detectors...).
Two approaches were considered for how new element types get added:
1. A **code-level typed catalog** — a closed set of element types, each
   with its own strongly-typed attributes, extended by development work.
2. A **runtime-configurable catalog** — an admin creates new element types
   and their custom attributes from the UI, with values stored in a
   generic (EAV-style) schema.

## Decision
Element types are a **closed, code-level catalog**, extended by
development work whenever a new RIPCI-regulated element type needs to be
supported. Each element type has its own strongly-typed detail attributes
(e.g., extinguisher: weight, agent type; BIE: hose diameter, pressure),
validated at the type level rather than generically.

**Review frequency (M/T/S/A) follows the same reasoning** and is also a
fixed, code-level enum — not admin-configurable.

What **is** admin-configurable is the checklist question catalog (which
questions apply, per element type and review frequency) — see the domain
model design doc for that model.

## Rationale
RIPCI-regulated elements and their inspection periods form a fixed,
regulation-defined vocabulary — not something an end user invents at
runtime. Adding a new element type is a deliberate, infrequent development
task (a new regulation category appearing), not a runtime configuration
need. A typed catalog keeps validation, forms, and persistence simple and
safe; a dynamic/EAV schema would add real complexity (generic validation,
dynamically-rendered forms, weaker type safety) for a flexibility need that
doesn't actually exist in this domain.

## Consequences
- Adding a new element type requires a deploy (new domain type + migration
  + UI form) — acceptable given the closed, regulation-driven catalog.
- Strong typing and compile-time safety for element-specific attributes.
- The checklist question catalog remains the actual configurability surface
  requested by the user (checklist question management), scoped by element type
  and review frequency.

## Alternatives Considered
- **Dynamic/EAV runtime-configurable element types** — rejected: solves a
  flexibility problem this domain doesn't have, at the cost of type safety
  and implementation complexity.
