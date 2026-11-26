# Reviewer Signature

## Purpose

Each user who signs reviews registers their own signature image (FR-010,
slice 2). A review is signed by completing it (`review-session-management`,
_Completion Is the Signing Act_), so the users who may register a
signature are exactly those who hold `reviewSession:complete`: today the
`MAINTENANCE_TECHNICIAN` and the `COMMUNITY_REPRESENTATIVE`. Each of them
reads and changes only their own signature; no other user, the system
admin included, reads or changes it. The page is owned by
`reviewer-signature-ui`.

Signing a review (completing it) requires the performer's registered
signature and copies it onto the session
(`review-session-management`, _Completion Is the Signing Act_): the copy is
the session's own, so replacing a signature afterwards never changes the
copy of a session already signed. Only the current signature is replaced;
every earlier copy keeps the image it was signed with.

Out of scope: removing a signature, an admin uploading one on someone's
behalf, the signer's full name.

## Requirements

### Requirement: Read the Own Signature Status

The system MUST answer `GET /me/signature` with 200 and
`{ hasSignature, updatedAt }` for the calling user: `hasSignature: true`
and the time of the last upload when they have registered a signature,
otherwise `hasSignature: false` and `updatedAt: null`. The storage key
MUST NOT appear in any response.

#### Scenario: A reviewer without a signature

- GIVEN a technician who never uploaded a signature
- WHEN they read their signature status
- THEN the response MUST be 200 with `hasSignature: false` and `updatedAt: null`

#### Scenario: A reviewer with a signature

- GIVEN a technician who uploaded a signature
- WHEN they read their signature status
- THEN the response MUST be 200 with `hasSignature: true` and the upload time as `updatedAt`

### Requirement: Upload the Own Signature

The system MUST accept the caller's signature at `PUT /me/signature` as
`multipart/form-data` with the file in the `file` field. It MUST accept
PNG, JPEG and WebP images of at most 2 MiB (2,097,152 bytes), recognised
by content exactly as the organization logo is
(`organization-profile-management`, _Upload the Organization Logo_);
anything else, an SVG included, MUST be rejected with 400 and code
`SIGNATURE_UNSUPPORTED_FORMAT`. On success it MUST respond 200 with the
status of _Read the Own Signature Status_.

The upload form follows the logo's rules with its own codes: no file is
400 `SIGNATURE_FILE_MISSING`; a file in another field, a second file, a
text field, a body that cannot be parsed or a multipart subtype other
than form-data is 400 `SIGNATURE_UPLOAD_INVALID`; a file over 2 MiB is
413 `SIGNATURE_TOO_LARGE`.

A new upload MUST replace the caller's previous signature, and the
previous file MUST be deleted from storage. A rejected upload MUST change
nothing. The bytes MUST be stored through the storage port under a fresh
key, outside the database. An upload changes only the caller's own
signature.

#### Scenario: A PNG, JPEG or WebP signature is stored

- GIVEN a technician
- WHEN they upload a PNG, a JPEG or a WebP image of at most 2 MiB
- THEN the response MUST be 200 with `hasSignature: true`, and their signature image read MUST return the same bytes

#### Scenario: An SVG or another format is rejected

- GIVEN a technician with a signature
- WHEN they upload an SVG image, or a file that is not an image
- THEN the response MUST be 400 with code `SIGNATURE_UNSUPPORTED_FORMAT`, and their signature MUST be unchanged

#### Scenario: A signature over the size limit is rejected

- GIVEN a file larger than 2 MiB
- WHEN it is uploaded as a signature
- THEN the response MUST be 413 with code `SIGNATURE_TOO_LARGE`, and nothing MUST change

#### Scenario: An upload without a file is rejected

- GIVEN a request that carries no file and no text field
- WHEN it is submitted
- THEN the response MUST be 400 with code `SIGNATURE_FILE_MISSING`, and nothing MUST change

#### Scenario: A malformed upload form is rejected

- GIVEN a form with the file in another field, a second file or a text field
- WHEN it is submitted
- THEN the response MUST be 400 with code `SIGNATURE_UPLOAD_INVALID`, and nothing MUST change

#### Scenario: A new upload replaces the signature

- GIVEN a representative who already has a signature
- WHEN they upload another one
- THEN their signature image read MUST return the new image, and only the new file MUST remain in storage

#### Scenario: One reviewer's upload does not touch another's

- GIVEN two technicians, each with a signature
- WHEN one of them uploads a new signature
- THEN the other's signature image read MUST still return their own image

### Requirement: Read the Own Signature Image

The system MUST serve the caller's signature at `GET /me/signature/image`
with the stored bytes, the content type of their format (`image/png`,
`image/jpeg` or `image/webp`), `Cache-Control: no-store`,
`Content-Security-Policy: default-src 'none'; sandbox` and
`X-Content-Type-Options: nosniff`. When the caller has no signature, or
its file is missing from storage, it MUST respond 404 with code
`SIGNATURE_NOT_FOUND`. No route reads another user's signature.

#### Scenario: The signature is served with its content type

- GIVEN a technician who uploaded a WebP signature
- WHEN they read their signature image
- THEN the response MUST be 200 with `Content-Type: image/webp`, `Cache-Control: no-store` and the uploaded bytes

#### Scenario: No signature to serve

- GIVEN a technician without a signature, or whose recorded file is missing
- WHEN they read their signature image
- THEN the response MUST be 404 with code `SIGNATURE_NOT_FOUND`

### Requirement: Only Users Who Sign Reviews Have a Signature

Every `/me/signature` route MUST require `reviewSession:complete`. A
caller without it, such as a `SYSTEM_ADMIN`, a `MANAGER` or a
`MAINTENANCE_COMPANY_MANAGER`, MUST receive 403 and nothing MUST change;
an unauthenticated caller MUST receive 401.

#### Scenario: The system admin has no signature routes

- GIVEN a system admin
- WHEN they read the status, read the image or upload a signature
- THEN each response MUST be 403, and nothing MUST be stored

#### Scenario: An unauthenticated caller

- GIVEN no valid session
- WHEN any `/me/signature` route is called
- THEN the response MUST be 401
