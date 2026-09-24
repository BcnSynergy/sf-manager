# Review Document UI

## Purpose

The printable page of one completed review's document (FR-010, slice 1
of 2): it renders the data returned by the `review-document` read and
lets the user print it, or save it as PDF, through the **browser's own**
print dialog — the same mechanism `element-label-printing` uses. It is
reached from exactly **one** link, on the read-only session view in
review history (`review-history-ui`); the field flow carries no link to
it (supersedes proposal question 3, decided 2026-09-23). What each role
may open is decided entirely by the server.

Shipped in the same change as its API, per ADR-006's 2026-08-25
addendum. Out of scope (slice 2): signer full name and signature image.
Also out of scope: any download, email or share control, and any logo.

## Requirements

### Requirement: The Document Page Is Gated on the Five History Roles

The document page MUST be restricted to authenticated users holding
`MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`,
`MAINTENANCE_COMPANY_MANAGER`, `SYSTEM_ADMIN` or `MANAGER` — the same
five-role gate as every review-history route. The `MANAGER` gate MUST be
the role alone and MUST NOT depend on `VIEW_ALL_REVIEWS`, which the
client never learns. An unauthenticated visitor MUST be redirected to
`/login`.

#### Scenario: All five history roles reach the page
- GIVEN the caller is authenticated as any of the five history roles
- WHEN they navigate to the document page of a session
- THEN the page MUST render, and the client's "not authorized" message MUST NOT appear

#### Scenario: An ungranted manager gets the server's answer
- GIVEN a `MANAGER` holding no capability
- WHEN they open an existing completed session's document page
- THEN the route MUST NOT refuse them client-side, and the page's uniform unreachable message MUST be shown

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to the document page
- THEN they MUST be redirected to `/login`

### Requirement: Document Page Content

The page MUST render, in this order:

| Region | Required content |
|---|---|
| Letterhead | The organization's non-blank profile fields (see *A Blank or Incomplete Profile Still Prints*) |
| Session data | Community name, localized element type, localized frequency, template name and version, start and completion dates, and the maintenance company's name when present |
| Record | Every entry, in the deterministic order the server returns them (element code ascending, entries lacking a code last; ties, including among code-less entries, broken by recorded time then entry id — `review-document`): its element's code, name and location, then each question's snapshotted wording, in the frozen template's question order, with its localized answer; or, for an unreviewed element, a localized "not reviewed" label with its recorded reason |
| Signature footer | A localized "signed by" label with the performer's email, and the signing date equal to `completedAt`, rendered as **date and time** (`HH:mm`), fixed to `Europe/Madrid` |

A deactivated or soft-deleted element MUST render under its real code,
name and location, exactly as an active element does. Only an entry
whose element id resolves no row at all MUST render under a localized
neutral label, never a blank or raw identifier. If `communityName`,
`maintenanceCompanyName` or `performedByEmail` is the defensive-fallback
empty string (an id with no resolvable row at all — not expected in
practice), the page MUST render a localized placeholder there instead of
a blank cell, exactly as the neutral element label does; this is
distinct from a session carrying no company at all, which omits the
company line entirely. A completed session with zero entries MUST still
render its letterhead, session data and signature footer, with the
record region showing no entry and no error. The page MUST NOT hide,
re-sort or truncate entries, and MUST NOT render a signature image or a
signer name other than the email.

#### Scenario: A completed session's document renders all regions
- GIVEN a completed session with answered elements, one unreviewed element and an attributed company
- WHEN an in-scope user opens its document page
- THEN the letterhead, session data, every entry with its answers or reason, and the signature footer with email and signing date MUST be shown

#### Scenario: A session with no company omits the company line
- GIVEN a completed session with no attributed company
- WHEN its document page renders
- THEN no company line MUST be shown, and no empty label or error MUST appear

#### Scenario: A defensive-fallback empty value renders a placeholder, not a blank cell
- GIVEN a document response whose `communityName`, `maintenanceCompanyName` or `performedByEmail` is the defensive-fallback empty string
- WHEN the page renders that field
- THEN it MUST show a localized placeholder, never a blank cell

#### Scenario: A completed session with zero entries still renders
- GIVEN a `completed` session with no recorded entries
- WHEN its document page renders
- THEN the letterhead, session data and signature footer MUST render, and the record region MUST show no entry and no error

#### Scenario: A decommissioned or soft-deleted element renders its real identity
- GIVEN an entry whose element was deactivated or soft-deleted after completion
- WHEN the page renders
- THEN it MUST show that element's real code, name and location with the entry's answers or reason

#### Scenario: An element with no resolvable row renders a neutral label
- GIVEN an entry whose element id resolves no row at all
- WHEN the page renders
- THEN it MUST show a localized neutral label with the entry's answers or reason

#### Scenario: Entries are rendered in the server's deterministic order
- GIVEN the server returns entries ordered by element code, and their answers ordered by the frozen template's question order
- WHEN the page renders
- THEN every entry and every answer MUST be shown in that order, none hidden, re-sorted or re-ordered client-side

### Requirement: A Blank or Incomplete Profile Still Prints

The page MUST remain printable whatever the profile's state. Blank
profile fields MUST be omitted from the letterhead, with no empty label.
When **every** field is blank, no letterhead MUST render at all. When
**at least one** field is blank, the page MUST show an on-screen warning
that the organization profile is incomplete; that warning MUST NOT
appear in the printed output. When all six fields hold a value, no
warning MUST render.

#### Scenario: A fully blank profile prints without letterhead
- GIVEN every organization profile field is blank
- WHEN the document page renders and is printed
- THEN the screen MUST show the warning, and the print output MUST contain no letterhead and no warning

#### Scenario: A partially filled profile prints its filled fields
- GIVEN some profile fields hold values and at least one is blank
- WHEN the document page renders and is printed
- THEN only the filled fields MUST appear in the letterhead, and the warning MUST appear on screen only

#### Scenario: A complete profile shows no warning
- GIVEN all six profile fields hold values
- WHEN the document page renders
- THEN the full letterhead MUST render and no warning MUST be shown

### Requirement: Print Through the Browser, Document Only

The page MUST offer exactly **one** print control, which MUST open the
browser's print dialog — from which the user may also save as PDF. The
printed output MUST contain only the document: the global navigation,
the print control, the incomplete-profile warning and every other
screen-only control MUST NOT appear in it. Conformance MUST be
established against a real print preview on a running application, not
only by a test asserting a print rule exists. On screen, the page MUST
render the global navigation normally.

#### Scenario: The print control opens the browser print dialog
- GIVEN an in-scope user on a document page
- WHEN they activate the print control
- THEN the browser's print dialog MUST open, and no request for a file MUST be made

#### Scenario: Print output excludes application chrome
- GIVEN the document page rendered inside the global navigation
- WHEN its print preview is inspected on a running application
- THEN no navigation item, logout control, print control or warning MUST appear, and the document content MUST be fully visible

#### Scenario: The navigation still shows on screen
- GIVEN a user viewing the document page without printing
- WHEN the page renders
- THEN the global navigation MUST be present, as on every authenticated page

### Requirement: Loading and Unreachable States

The page MUST show an explicit loading state while the request is in
flight. For a `404` response — whether the session does not exist, is
out of scope, or is a `draft` — the page MUST show one uniform localized
unreachable message, selected from `ApiError.status`/`.code`, never from
a server-supplied English message, and never implying the session
exists. A network error or a `5xx` response MUST be handled exactly as
`ReviewHistoryDetailPage` handles it, through `mapApiErrorToMessageKey`
in `apps/web/src/review-session/error-messages.ts` — it MUST NOT be
folded into the uniform 404 message. Neither state MUST be a blank page.

#### Scenario: Every 404 cause shows the same message
- GIVEN the user opens, in turn, the document page of a nonexistent session, an out-of-scope session and a draft
- WHEN each `404` rejection is shown
- THEN the message MUST be identical in all three cases

#### Scenario: A network error or 5xx is not folded into the uniform message
- GIVEN the document request fails with a network error or a `5xx` response
- WHEN the failure is shown
- THEN it MUST use `mapApiErrorToMessageKey` from `apps/web/src/review-session/error-messages.ts`, not the uniform 404 message

#### Scenario: A loading state renders while in flight
- GIVEN the document request has not resolved
- WHEN the page renders
- THEN an explicit loading indication MUST be shown, not a blank page

### Requirement: Exactly One Entry Link Reaches the Document Page

The document page MUST be reachable without a hand-typed URL through
**exactly one** "View document" link:

| Link | Host | Reached by |
|---|---|---|
| History link | The read-only historical session view (`review-history-ui`) | All five history roles |

The field flow's own completed-session view (`review-session-ui`) MUST
offer **no** document link (supersedes proposal question 3, decided
2026-09-23): that view's read is scoped by performer, not by history, so
a performer later losing their history scope — a representative
unassigned from the community, for instance — would otherwise see a link
to a uniform `404` on a document the history-scoped view would still
show correctly. Completing a session MUST NOT open the document page
automatically. No other page MUST link to it, and no `draft` session
MUST offer the link.

#### Scenario: The history view reaches its session's document
- GIVEN any of the five history roles on a completed session's read-only view
- WHEN they activate "View document"
- THEN that session's document page MUST be reached

#### Scenario: The field flow offers no document link
- GIVEN a performer who has just signed and closed a session
- WHEN they view the resulting read-only view in the field flow
- THEN no "View document" link MUST be offered there; the performer reaches the document only through review history

#### Scenario: Signing does not auto-open the document
- GIVEN a performer confirms "Sign and close"
- WHEN completion succeeds
- THEN the document page MUST NOT open by itself, and no print dialog MUST open

### Requirement: The Document Page Offers No Other Action

The page MUST offer no control that edits, reopens, answers, completes,
discards, deletes, re-signs, downloads, emails or shares. Its only
controls MUST be the print control and ordinary navigation.

#### Scenario: Only print and navigation controls render
- GIVEN the document page of a completed session
- WHEN its controls are enumerated
- THEN none MUST mutate the session or download, email or share the document

### Requirement: Internationalization Coverage

The document page MUST contain zero hardcoded UI strings. Every label,
the warning, the unreachable and loading messages and the "View
document" link labels MUST come from translation keys with real values
in `en`, `es` and `ca`, enforced by the existing locale parity test. In
addition, every key this change introduces MUST be listed in a
`REQUIRED_REVIEW_DOCUMENT_KEY_PATHS` existence list in
`apps/web/src/i18n/locales.test.ts` (following the file's existing
required-key-list convention), so a key silently dropped from all three
locale files — not just made inconsistent between them — fails the
suite.
Element type, frequency, answer values and the unreviewed state MUST be
rendered through localized labels, and dates through locale-aware
formatting, never raw.

#### Scenario: Every new key is translated in all three locales
- GIVEN the translation keys this change introduces
- WHEN `en`, `es` and `ca` are compared by the locale parity test
- THEN every key MUST have a real, non-placeholder value in all three

#### Scenario: Every new key is asserted to exist, not only to be consistent
- GIVEN `REQUIRED_REVIEW_DOCUMENT_KEY_PATHS` in `locales.test.ts`
- WHEN a key this change introduces is removed from all three locale files
- THEN the existence-list assertion MUST fail, independently of the parity test

#### Scenario: Enum values are never rendered raw
- GIVEN an element type, frequency or answer value on the document
- WHEN it is rendered
- THEN it MUST show a localized label, not the raw enum string

#### Scenario: Dates render in a fixed time zone regardless of the viewer's own
- GIVEN a session with a known `completedAt`, viewed by users whose devices are set to different time zones
- WHEN each views the document page
- THEN every rendered date MUST be formatted in the fixed `Europe/Madrid` time zone and MUST be identical across viewers, in each of `en`, `es` and `ca`

#### Scenario: The signing date shows both date and time
- GIVEN a session with a known `completedAt`
- WHEN the signature footer renders
- THEN the signing date MUST show both the date and the time (`HH:mm`), fixed to `Europe/Madrid`
