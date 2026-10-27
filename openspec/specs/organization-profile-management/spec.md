# Organization Profile Management

## Purpose

The property management company's own corporate data (ADR-012, FR-013),
modelled as a **singleton**: exactly one `OrganizationProfile` row per
deployment, holding `id`, `name`, `legalName`, `taxId`, `address`,
`phone`, `email` and `logoAssetId`, the storage key of its logo. No `deletedAt`
(ADR-010) — the row must always exist.

The row is created by the schema migration, not by the application, so
there is no create path and no "does it exist yet" branch anywhere. The
only operations are a read, a partial update, and the logo's read,
upload and removal. `taxId` is free
text with no format rule, no checksum and no uniqueness constraint
(uniqueness is meaningless for a single row) — the same call
`maintenance-company` made for the same field.

Out of scope: object storage (the logo lives in a local volume behind a
storage port, ADR-012 addendum), SVG logos (EN-109), any consumer of
this data other than the
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
- THEN none MUST exist — no operation MUST insert a profile row

### Requirement: Read the Organization Profile

The system MUST expose a single read of the organization profile at
`GET /organization-profile`, taking no identifier. It MUST respond 200
with `id`, `name`, `legalName`, `taxId`, `address`, `phone`, `email` and
`hasLogo`.

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

### Requirement: logoAssetId Is a Storage Key, Absent From the API

`logoAssetId` MUST be `null` until a logo is uploaded, and then MUST hold
the opaque storage key of the current logo (for example
`logos/<uuidv7>.png`), never a filesystem path. It MUST NOT appear in any
response, and the partial update MUST NOT write it: only the logo upload
does. Responses that carry the profile MUST instead carry `hasLogo`, `true`
exactly when a logo has been uploaded.

#### Scenario: The field is absent from the read response

- GIVEN any profile state
- WHEN the profile is read
- THEN the response MUST NOT carry a `logoAssetId` property in any form — not as `null`, not as an empty string

#### Scenario: Supplying the field writes nothing

- GIVEN an authorized caller submits `logoAssetId` or `hasLogo` in the update body
- WHEN the update is processed
- THEN the stored `logoAssetId` MUST be unchanged

#### Scenario: A profile without a logo

- GIVEN a profile with no logo ever uploaded
- WHEN the profile is read
- THEN the response MUST carry `hasLogo: false`, and the logo read MUST respond 404

### Requirement: Upload the Organization Logo

The system MUST accept a logo at `PUT /organization-profile/logo` as
`multipart/form-data` with the file in the `file` field. It MUST accept
PNG, JPEG and WebP images of at most 2 MiB (2,097,152 bytes), and MUST
decide the format from the file's content, not from its name or declared
content type. On success it MUST respond 200 with the profile, carrying
`hasLogo: true`.

A new upload MUST replace the previous logo, and the previous file MUST be
deleted from storage. A rejected upload MUST change nothing: no file is
stored and the current logo, if any, stays. The bytes MUST be stored
through a storage port under a fresh key, outside the database.

#### Scenario: A PNG, JPEG or WebP logo is stored

- GIVEN an authorized caller
- WHEN they upload a PNG, a JPEG or a WebP image of at most 2 MiB
- THEN the response MUST be 200 with `hasLogo: true`, and the logo read MUST return the same bytes

#### Scenario: The format is decided by the content

- GIVEN a PNG image named `logo.jpg` and declared as `image/jpeg`
- WHEN it is uploaded
- THEN it MUST be stored as a PNG, and the logo read MUST answer `image/png`

#### Scenario: Other formats are rejected

- GIVEN a file that is not a PNG, JPEG or WebP image, an SVG included, whatever its name
- WHEN it is uploaded
- THEN the response MUST be 400 with code `LOGO_UNSUPPORTED_FORMAT`, and nothing MUST change

#### Scenario: A logo over the size limit is rejected

- GIVEN a file larger than 2 MiB
- WHEN it is uploaded
- THEN the response MUST be 413, and nothing MUST change

#### Scenario: An upload without a file is rejected

- GIVEN a multipart request with no `file` part
- WHEN it is submitted
- THEN the response MUST be 400 with code `LOGO_FILE_MISSING`, and nothing MUST change

#### Scenario: A new upload replaces the logo

- GIVEN a profile that already has a logo
- WHEN another logo is uploaded
- THEN the logo read MUST return the new image, and only the new file MUST remain in storage

### Requirement: Read the Organization Logo

The system MUST serve the current logo at `GET /organization-profile/logo`
with the stored bytes, the content type of their format (`image/png`,
`image/jpeg` or `image/webp`) and `Cache-Control: no-store`. When there is
no logo to serve — none uploaded, or its file is missing from storage — it
MUST respond 404. Clients MUST read the logo through this endpoint, never
from a static file path.

#### Scenario: The logo is served with its content type

- GIVEN an uploaded WebP logo
- WHEN the logo is read
- THEN the response MUST be 200 with `Content-Type: image/webp`, `Cache-Control: no-store` and the uploaded bytes

### Requirement: Remove the Organization Logo

The system MUST let a caller with `organizationProfile:update` remove the
logo with `DELETE /organization-profile/logo`. The response MUST be the
profile with `hasLogo: false`. The recorded key MUST be cleared first and
the file deleted from storage after it, so a failure never leaves the
profile pointing at a deleted file: if clearing the key fails, the logo
and its file MUST be kept; if only the file deletion fails, the removal
MUST still succeed and the file is left orphaned. Removing when there is
no logo MUST succeed and change nothing. The other profile fields MUST be
unchanged.

#### Scenario: The logo is removed

- GIVEN a profile with an uploaded logo
- WHEN a `SYSTEM_ADMIN` removes it
- THEN the response MUST be 200 with `hasLogo: false` and no `logoAssetId`, the file MUST be deleted from storage, and the logo read MUST respond 404

#### Scenario: Removing without a logo

- GIVEN a profile with no logo
- WHEN a `SYSTEM_ADMIN` removes the logo
- THEN the response MUST be 200 with `hasLogo: false`, and nothing MUST be written or deleted

### Requirement: The Profile Has No Create and No Delete Surface

The system MUST expose exactly five operations on the profile — the read,
the partial update, the logo read, the logo upload and the logo removal —
and MUST NOT expose a create, a delete of the profile, a list, or any
identifier-parameterised variant of the route. A `POST` or
`DELETE` to `/organization-profile`, and any request to an
`/organization-profile/:id`-shaped path, MUST NOT resolve to an
organization-profile operation.

The entity MUST carry no `deletedAt` and MUST NOT participate in the
soft-delete mechanism (ADR-010): the row representing the company
running this very instance is not a deletable record. Removing the logo
(`DELETE /organization-profile/logo`) clears one field and deletes a file;
it is not a delete of the profile.
(Previously: exactly four operations, without the logo removal.)

#### Scenario: Only five operations are declared

- GIVEN the organization-profile routes after this change
- WHEN they are enumerated
- THEN exactly five MUST exist — the read, the partial update, the logo read, the logo upload and the logo removal — with no create, profile delete, list or `:id` variant among them
  (Previously: exactly four, without the logo removal.)

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
behaviour in the system. Exactly **one** consumer of the profile MAY
exist outside this capability: the `review-document` capability, through
its document read, which returns the six text fields and `hasLogo` as a
letterhead, and its document logo read
(`GET /review-history/:sessionId/document/logo`), which returns the
logo through this capability's own logo read and never the storage key.
No other endpoint, use case or domain rule outside this capability MUST
read the profile, and **no** reader — the document reads included — MUST
condition itself on the profile's completeness: a review document MUST
be readable whether the profile is blank, partially filled or complete.
(Previously: exactly one read, the `review-document` read, returning the
six text fields.)

This capability's own endpoints MUST be unchanged by that consumer: the
same operations, the same response shape and the same permissions.

#### Scenario: Only the document read consults the profile

- GIVEN the application after this change
- WHEN every read of the organization profile is enumerated
- THEN each MUST originate from this capability's own read endpoints or from the `review-document` document read and document logo read, and no other module MUST depend on the profile
  (Previously: from this capability's own read endpoint or from the `review-document` read.)

#### Scenario: A blank profile does not block the document

- GIVEN the freshly seeded, entirely blank profile
- WHEN an in-scope caller reads a completed session's review document
- THEN the read MUST succeed, carrying the six fields as empty strings

#### Scenario: The profile's own endpoints are unchanged

- GIVEN the organization-profile endpoints with and without the `review-document` consumer
- WHEN their permissions, request and response shapes are compared
- THEN they MUST be identical, and all MUST remain reachable by `SYSTEM_ADMIN` only
