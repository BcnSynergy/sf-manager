# Organization Profile Management

## Purpose

The property management company's own corporate data (ADR-012, FR-013),
modelled as a **singleton**: exactly one `OrganizationProfile` row per
deployment, holding `id`, `name`, `legalName`, `taxId`, `address`,
`phone`, `email` and a reserved, inert `logoAssetId`. No `deletedAt`
(ADR-010) — the row must always exist.

The row is created by the schema migration, not by the application, so
there is no create path and no "does it exist yet" branch anywhere. The
only two operations are a read and a partial update. `taxId` is free
text with no format rule, no checksum and no uniqueness constraint
(uniqueness is meaningless for a single row) — the same call
`maintenance-company` made for the same field.

Out of scope this slice (proposal Out of Scope): logo upload and all
object storage, any consumer of this data other than the
`review-document` read, which renders it as a letterhead; no branding
surface and no "profile must be complete before X" rule, an
audit trail of edits, change history, and any unauthenticated read.

Access control — who may call these endpoints — is owned by the
`authorization` spec. The web surface is owned by
`organization-profile-admin-ui`.

## Requirements

### Requirement: The Profile Row Exists Before Any Request

The system MUST guarantee that exactly one `OrganizationProfile` row
exists in every environment, created by the database migration that
creates the table — **not** lazily by the application on first read or
first write, and **not** by the development seed script (which is
production-gated and therefore cannot guarantee the row). The seeded
row MUST carry a server-chosen `id` (UUIDv7, ADR-009), a blank (`''`)
value in each of `name`, `legalName`, `taxId`, `address`, `phone` and
`email`, and `null` in `logoAssetId`.

No application code path MUST create an `OrganizationProfile` row. The
seed MUST be idempotent: re-running the migration MUST NOT produce a
second row.

#### Scenario: The row exists after migration, with no request made
- GIVEN an empty database
- WHEN the migrations are deployed and no application request of any kind has been issued
- THEN exactly one `OrganizationProfile` row MUST exist, with every one of the six text fields blank and `logoAssetId` null

#### Scenario: The seed does not duplicate the row
- GIVEN a database whose `OrganizationProfile` row already exists
- WHEN the migration's seed statement is applied again
- THEN exactly one row MUST still exist, unmodified

#### Scenario: No application path creates the row
- GIVEN the application's use cases, repository port and adapter after this change
- WHEN they are inspected for an insert of an `OrganizationProfile`
- THEN none MUST exist — reading and updating MUST be the only two operations

### Requirement: Read the Organization Profile

The system MUST expose a single read of the organization profile at
`GET /organization-profile`, taking no identifier. It MUST respond 200
with `id`, `name`, `legalName`, `taxId`, `address`, `phone` and `email`.

It MUST **never** respond 404, at any point in the lifecycle — a blank
seeded row is a valid, readable resource, not a missing one. Blank
values MUST be returned verbatim as empty strings, with no substitution,
omission or "incomplete" flag of any kind: whether the profile looks
complete is a presentation judgement, not a server statement.

#### Scenario: The blank seeded profile reads successfully
- GIVEN the freshly seeded profile, with no update ever applied
- WHEN an authorized caller reads the profile
- THEN the response MUST be 200 and MUST carry all six text fields as empty strings

#### Scenario: A filled profile reads back its stored values
- GIVEN every field has been given a value
- WHEN an authorized caller reads the profile
- THEN the response MUST be 200 and each field MUST equal the stored value

#### Scenario: The read never reports the profile as missing
- GIVEN any lifecycle state of the installation — freshly migrated, partially filled or fully filled
- WHEN the profile is read
- THEN the response MUST NOT be 404, and no "not found" error code MUST be reachable on this endpoint

#### Scenario: The response carries no completeness flag
- GIVEN a profile with some fields blank
- WHEN it is read
- THEN the response MUST carry the field values only, and no server-computed `complete`, `incomplete` or equivalent flag

### Requirement: Partial Update of the Organization Profile

The system MUST expose a single partial update at
`PATCH /organization-profile`, taking no identifier. Any subset of
`name`, `legalName`, `taxId`, `address`, `phone` and `email` MAY be
supplied. Supplied values MUST be stored trimmed. Fields **omitted**
from the request body MUST be left exactly as they were.

A successful update MUST respond 200 with the profile's full updated
representation — the same shape the read returns — so that no follow-up
read is required to learn the result.

#### Scenario: A subset is updated and the rest is untouched
- GIVEN a profile whose six fields all hold distinct values
- WHEN an authorized caller supplies new `name` and `email` only
- THEN the response MUST be 200, `name` and `email` MUST hold the new values, and `legalName`, `taxId`, `address` and `phone` MUST be unchanged

#### Scenario: Values are stored trimmed
- GIVEN an authorized caller supplies a field with leading and trailing whitespace around a non-blank value
- WHEN the update succeeds
- THEN the stored and returned value MUST be the trimmed value

#### Scenario: The update responds with the full profile
- GIVEN any successful update
- WHEN the response body is inspected
- THEN it MUST carry the same fields the read returns, reflecting the post-update state

#### Scenario: taxId takes any non-blank text
- GIVEN an authorized caller supplies a `taxId` that is not a valid Spanish NIF or CIF
- WHEN the update is submitted
- THEN it MUST be accepted — no format, checksum or uniqueness rule MUST be applied to `taxId`

### Requirement: A Supplied Field Must Be Non-Blank

A field **present** in the update body MUST be non-empty after
trimming. The system MUST reject with 400, changing nothing, when a
supplied field is an empty string, whitespace-only, or explicitly
`null`. `null` MUST be rejected rather than treated as "clear this
field": this slice offers **no way to blank a field that has a value**,
because a blank field is a seed-state grandfathering, not a state an
operator may return the profile to. If clearing is ever needed it MUST
be introduced deliberately, not inherited from a permissive `null`.

A rejected update MUST leave every field, including the fields that
were valid in the same request, unchanged.

#### Scenario: An empty string is rejected
- GIVEN an authorized caller supplies `name` as `""`
- WHEN the update is submitted
- THEN the response MUST be 400 and no field MUST change

#### Scenario: A whitespace-only value is rejected
- GIVEN an authorized caller supplies `legalName` as `"   "`
- WHEN the update is submitted
- THEN the response MUST be 400 and no field MUST change

#### Scenario: An explicit null is rejected, not treated as a clear
- GIVEN a profile whose `phone` holds a value, and an authorized caller supplies `phone` as `null`
- WHEN the update is submitted
- THEN the response MUST be 400 and `phone` MUST still hold its previous value

#### Scenario: A partially invalid update writes nothing
- GIVEN an authorized caller supplies a valid `name` and a blank `email` in the same request
- WHEN the update is submitted
- THEN the response MUST be 400 and **both** `name` and `email` MUST be unchanged

### Requirement: An Update That Changes Nothing Succeeds

An update MUST be idempotent and MUST NOT require that something
actually change. Supplying values identical to the stored ones MUST
respond 200 with the unchanged profile, not an error. Supplying **no**
recognized field at all — an empty body, or a body carrying only
unrecognized properties — MUST likewise respond 200 with the unchanged
profile: the resource always exists, so "apply nothing to it" is a
well-defined outcome, and this matches the partial-update behaviour the
application already ships elsewhere.

Unrecognized properties MUST be ignored and MUST NOT be persisted.

#### Scenario: Re-sending the same values succeeds
- GIVEN a filled profile
- WHEN an authorized caller submits the identical values it already holds
- THEN the response MUST be 200 and the profile MUST be unchanged

#### Scenario: An empty body succeeds and changes nothing
- GIVEN any profile state
- WHEN an authorized caller submits an empty update body
- THEN the response MUST be 200 carrying the current profile, and no field MUST change

#### Scenario: Unrecognized properties are ignored, not persisted
- GIVEN an authorized caller submits a body carrying a property the profile does not define
- WHEN the update is submitted
- THEN that property MUST NOT be persisted anywhere, and the response MUST carry only the profile's defined fields

### Requirement: logoAssetId Is Reserved, Unwritable and Absent From the API

`logoAssetId` MUST exist on the schema and the domain entity as a
nullable column reserved for a future logo-upload slice (ADR-012), and
MUST be inert everywhere else. It MUST NOT appear in the read response
or in the update response, and MUST NOT be accepted in the update body.
Omitting it from the response is deliberate: a permanently-`null` field
teaches clients to depend on a contract that has no meaning yet, and
the upload slice would then have to change an already-consumed shape.
It MUST remain `null` for the whole life of this slice.

No object-storage service, client, credential, upload endpoint or
upload control MUST exist anywhere as a result of this change.

#### Scenario: The field is absent from the read response
- GIVEN any profile state
- WHEN the profile is read
- THEN the response MUST NOT carry a `logoAssetId` property in any form — not as `null`, not as an empty string

#### Scenario: Supplying the field writes nothing
- GIVEN an authorized caller submits `logoAssetId` in the update body
- WHEN the update is processed
- THEN the stored `logoAssetId` MUST still be `null`

#### Scenario: No upload surface ships
- GIVEN the API, the dependency manifests and the container composition after this change
- WHEN each is inspected
- THEN no object-storage service, client or credential MUST exist, and no upload endpoint MUST have been declared

### Requirement: The Profile Has No Create and No Delete Surface

The system MUST expose exactly two operations on the profile — the read
and the partial update — and MUST NOT expose a create, a delete, a
list, or any identifier-parameterised variant of the route. A `POST` or
`DELETE` to `/organization-profile`, and any request to an
`/organization-profile/:id`-shaped path, MUST NOT resolve to an
organization-profile operation.

The entity MUST carry no `deletedAt` and MUST NOT participate in the
soft-delete mechanism (ADR-010): the row representing the company
running this very instance is not a deletable record.

#### Scenario: Only two operations are declared
- GIVEN the organization-profile routes after this change
- WHEN they are enumerated
- THEN exactly two MUST exist — the read and the partial update — with no create, delete, list or `:id` variant among them

#### Scenario: A create or delete attempt does not reach a profile operation
- GIVEN an authenticated `SYSTEM_ADMIN`
- WHEN they issue `POST /organization-profile` and `DELETE /organization-profile`
- THEN neither MUST create, remove or modify any profile data

#### Scenario: The entity is not soft-deletable
- GIVEN the schema and the domain entity after this change
- WHEN they are inspected
- THEN neither MUST declare a `deletedAt`, and the profile repository MUST NOT extend the shared soft-deletable repository

### Requirement: An Incomplete Profile Blocks Nothing

A profile with blank fields MUST NOT block, gate or degrade any other
behaviour in the system. Exactly **one** read of the profile MAY exist
outside this capability: the `review-document` read, which returns the
six text fields as a letterhead. No other endpoint, use case or domain
rule outside this capability MUST read the profile, and **no** reader —
the document read included — MUST condition itself on the profile's
completeness: a review document MUST be readable whether the profile is
blank, partially filled or complete.

This capability's own endpoints MUST be unchanged by that consumer: the
same two operations, the same response shape and the same permissions.

#### Scenario: Only the document read consults the profile
- GIVEN the application after this change
- WHEN every read of the organization profile is enumerated
- THEN each MUST originate from this capability's own read endpoint or from the `review-document` read, and no other module MUST depend on the profile

#### Scenario: A blank profile does not block the document
- GIVEN the freshly seeded, entirely blank profile
- WHEN an in-scope caller reads a completed session's review document
- THEN the read MUST succeed, carrying the six fields as empty strings

#### Scenario: The profile's own endpoints are unchanged
- GIVEN `GET` and `PATCH /organization-profile` before and after this change
- WHEN their permissions, request and response shapes are compared
- THEN they MUST be identical, and both MUST remain reachable by `SYSTEM_ADMIN` only
