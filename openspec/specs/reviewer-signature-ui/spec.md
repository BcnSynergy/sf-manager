# Reviewer Signature UI

## Purpose

The "My signature" page, where a user who signs reviews sees and replaces
their own signature image (`reviewer-signature`). Every user-facing string
is available in English, Spanish and Catalan.

## Requirements

### Requirement: The My Signature Page Is Reachable by Reviewers Only

The web app MUST offer a "My signature" navigation entry, leading to
`/my-signature`, to the `MAINTENANCE_TECHNICIAN` and the
`COMMUNITY_REPRESENTATIVE`, and to no other role. Any other role opening
`/my-signature` MUST be handled as every other route it may not open.

#### Scenario: A technician finds the page

- GIVEN a signed-in technician
- WHEN they open the navigation
- THEN a "My signature" entry MUST be present and lead to `/my-signature`

#### Scenario: The system admin has no entry

- GIVEN a signed-in system admin
- WHEN they open the navigation
- THEN no "My signature" entry MUST be present

### Requirement: See and Replace the Own Signature

The page MUST show the caller's current signature image when they have
one, and otherwise a message saying no signature is registered yet and
that a review cannot be signed without one. It MUST offer a file control
accepting PNG, JPEG and WebP images and an Upload button that sends the
chosen file, as the organization logo page does; a file over 2 MB or of
another type MUST be named as such without being sent. After a successful
upload the page MUST show the new image and a confirmation in a status
region; when the image cannot be loaded, a message MUST replace it. A rejected upload MUST show an error
naming the cause (unsupported format, over 2 MB, or any other failure)
and keep the current signature shown.

#### Scenario: No signature yet

- GIVEN a technician without a signature
- WHEN they open "My signature"
- THEN the page MUST say no signature is registered and that reviews cannot be signed without one, and MUST offer the upload control

#### Scenario: Uploading a signature

- GIVEN a technician on "My signature"
- WHEN they choose a PNG image and press Upload
- THEN the page MUST show the uploaded image and a confirmation

#### Scenario: An unsupported file

- GIVEN a technician with a signature, on "My signature"
- WHEN they upload a file the API rejects as an unsupported format
- THEN the page MUST show the unsupported-format error and keep showing the current signature
