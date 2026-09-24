# Delta for Organization Profile Management

> **Purpose amendment (for archive):** in the Purpose's out-of-scope
> list, replace "any consumer of this data (no report rendering, no
> branding surface, no "profile must be complete before X" rule)" with:
> "any consumer of this data other than the `review-document` read, which
> renders it as a letterhead; no branding surface and no "profile must be
> complete before X" rule". Nothing else in the Purpose changes.

## MODIFIED Requirements

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
(Previously: no module outside this capability read the profile at all —
"nothing consumes this data in this slice, by design".)

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
