# Architecture Decision Records — Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](ADR-001-deployment-model-single-instance-per-property-manager.md) | Deployment model — one instance per property management company | Accepted |
| [ADR-002](ADR-002-backend-nestjs-clean-architecture.md) | Backend — NestJS, modular monolith, Clean Architecture | Accepted |
| [ADR-003](ADR-003-postgresql.md) | PostgreSQL as the database engine | Accepted |
| [ADR-004](ADR-004-multiplatform-frontend-monorepo.md) | Multiplatform frontend — React + React Native + Electron monorepo | Accepted |
| [ADR-005](ADR-005-authorization-model-scoped-rbac.md) | Authorization model — RBAC scoped by resource | Superseded by ADR-011 |
| [ADR-006](ADR-006-walking-skeleton-web-first.md) | Delivery strategy — walking skeleton, web first | Accepted |
| [ADR-007](ADR-007-i18n-multilanguage-ui-english-codebase.md) | Internationalization — multi-language UI (EN/ES/CA), English-only codebase | Accepted |
| [ADR-008](ADR-008-element-type-extensibility-typed-catalog.md) | Inspectable element type extensibility — code-level typed catalog | Accepted |
| [ADR-009](ADR-009-primary-key-strategy-uuidv7.md) | Primary key strategy — UUIDv7, generated in the application layer | Accepted |
| [ADR-010](ADR-010-soft-delete-strategy.md) | Soft delete strategy — split by data kind | Accepted |
| [ADR-011](ADR-011-expanded-roles-and-auth-architecture.md) | Expanded user roles and authentication/authorization architecture | Accepted |
| [ADR-012](ADR-012-property-management-company-profile-entity.md) | Property management company profile — domain entity, not system config | Accepted |
| [ADR-013](ADR-013-orm-prisma-strict-boundary.md) | ORM strategy — Prisma, with a strictly enforced Clean Architecture boundary | Accepted |
| [ADR-014](ADR-014-api-style-rest-openapi.md) | API style — REST + OpenAPI | Accepted |
| [ADR-015](ADR-015-frontend-and-tooling-defaults.md) | Frontend and cross-cutting tooling defaults (Vite, Zod, Jest/Vitest, Node LTS) | Accepted |

See also: [domain model — inspections](../architecture/domain-model-inspections.md)
(entities implementing ADR-011 and ADR-008).

## Open decisions (not yet an ADR)

- **Containerization / Docker Compose layout**: requested as a goal, not yet
  written up as an ADR.
- **i18n libraries/mechanism per platform**: locales are decided (ADR-007), the
  actual tooling (e.g. react-i18next, nestjs-i18n) is a design-phase detail.
- **Maintenance-company assignment granularity by element type**, whether a
  `ReviewSession` can ever cover more than one element type, and exact
  `ExtinguisherDetails` fields — see open questions in the domain model doc.
