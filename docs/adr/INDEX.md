# Architecture Decision Records — Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](ADR-001-deployment-model-single-instance-per-property-manager.md) | Deployment model — one instance per property management company | Accepted |
| [ADR-002](ADR-002-backend-nestjs-clean-architecture.md) | Backend — NestJS, modular monolith, Clean Architecture | Accepted |
| [ADR-003](ADR-003-postgresql.md) | PostgreSQL as the database engine | Accepted |
| [ADR-004](ADR-004-multiplatform-frontend-monorepo.md) | Multiplatform frontend — React + React Native + Electron monorepo | Accepted |
| [ADR-005](ADR-005-authorization-model-scoped-rbac.md) | Authorization model — RBAC scoped by resource | Accepted |
| [ADR-006](ADR-006-walking-skeleton-web-first.md) | Delivery strategy — walking skeleton, web first | Accepted |
| [ADR-007](ADR-007-i18n-multilanguage-ui-english-codebase.md) | Internationalization — multi-language UI (EN/ES/CA), English-only codebase | Accepted |

## Open decisions (not yet an ADR)

- **Generic inspectable-element domain model**: extinguishers today, other RIPCI
  elements later (BIEs, emergency lighting, fire doors...). Deferred to the design
  phase for the first walking-skeleton slice per ADR-006.
- **Containerization / Docker Compose layout**: requested as a goal, not yet
  written up as an ADR.
- **i18n libraries/mechanism per platform**: locales are decided (ADR-007), the
  actual tooling (e.g. react-i18next, nestjs-i18n) is a design-phase detail.
