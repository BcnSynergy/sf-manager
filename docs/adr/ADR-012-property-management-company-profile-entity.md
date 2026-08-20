# ADR-012: Property Management Company Profile — Domain Entity, Not System Configuration

## Status
Accepted

## Context
Compliance reports need the property management company's own corporate
data — legal name, tax ID, address, contact info, logo — rendered on them.
Two options were considered: a system configuration file (env vars/config
file on the VPS) versus a domain entity managed through the app itself.

## Decision
Modeled as a domain entity, `PropertyManagementCompany` — a singleton (per
[ADR-001](ADR-001-deployment-model-single-instance-per-property-manager.md),
exactly one per deployment) stored in the database, editable only through
the app's own authenticated/authorized flow, not a file on disk.

Fields: `id` (UUIDv7, [ADR-009](ADR-009-primary-key-strategy-uuidv7.md)),
`name`, `legalName`, `taxId`, `address`, `phone`, `email`, `logoAssetId?`
(a reference to an object-storage key, not a raw filesystem path or a DB
blob — see infra note below). No `deletedAt`
([ADR-010](ADR-010-soft-delete-strategy.md)) — a singleton representing the
company running this very instance isn't a deletable record; the row must
always exist for reports to render.

**Amends [ADR-011](ADR-011-expanded-roles-and-auth-architecture.md)**: adds
`MANAGE_ORGANIZATION_PROFILE` to the `MANAGER` capability set. Updating the
company's own name/logo isn't privilege-escalation-sensitive like user
management — it's assignable like the other data-management capabilities.

## Rationale
- Config files bypass the application's own authentication/authorization
  model entirely — anyone with filesystem/server access could alter the
  legal name or logo shown on signed compliance documents, with no audit
  trail of who changed it or when, undermining the access-control work
  done in ADR-011.
- Ordinary business changes (new office address, rebranded logo) shouldn't
  require server/deployment access — they should be a normal in-app edit
  by a `SYSTEM_ADMIN`, same as any other business data.
- Config/env vars remain the right place for genuinely infrastructure-level
  settings (DB connection string, JWT secret, the demo-mode flag,
  object-storage credentials) — a different trust boundary (infra
  operator), appropriately separate from application business data.
- A logo is a binary asset, not a scalar config value — doesn't belong in
  `.env`/config files regardless of the auth argument above.

**Infra note**: the logo needs actual file storage, not a config value or
a DB blob. Given the Docker Compose deployment
([ADR-003](ADR-003-postgresql.md)) and the validated precedent from
RM-Manager, object storage (MinIO, S3-compatible) is the natural fit —
`logoAssetId` stores a reference/key, the actual bytes live in the bucket.
Full object-storage architecture (bucket layout, access URLs) is deferred
to when file storage is actually implemented — this ADR only decides that
the *reference* lives on the domain entity.

## Consequences
- Requires an object-storage service in `docker-compose.yml` once file
  uploads are implemented — not needed for the walking skeleton's first
  slice, but the field is reserved now so the entity doesn't need a later
  migration to add it.
- A `SYSTEM_ADMIN`-managed settings screen becomes a real, small FR (see
  FR-013).

## Alternatives Considered
- **Config file (`.env`/YAML)** — rejected per rationale above: bypasses
  auth/audit, awkward for binary logo data, requires server access for
  routine business changes.
- **Hardcoded at build/deploy time** (baked into a Docker image) —
  rejected: would require a rebuild/redeploy for the same routine changes,
  worse than a config file even.
