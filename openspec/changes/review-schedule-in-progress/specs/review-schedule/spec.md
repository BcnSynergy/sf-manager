# Delta for review-schedule

## ADDED Requirements

### Requirement: An Open Draft Marks a Pair as In Progress

Each entry MUST carry an `inProgress` flag. It MUST be true when at least one
session in status `draft` exists for the pair's community on a template whose
element type is the pair's and whose frequency is `QUARTERLY` or `ANNUAL`,
whichever user opened it and whether that template version is `active` or
`retired`. Otherwise it MUST be false. The flag MUST NOT change the pair's
status, driving obligation, deadline, last covering session date or position
in the list: a draft still never covers (_What Covers a Quarter_). The entry
MUST NOT carry who opened the draft, how many drafts exist, or when they
started.

#### Scenario: A quarterly draft marks the pair

- GIVEN a pair whose community has an open draft session on a `QUARTERLY` template of the pair's element type
- WHEN the schedule is read
- THEN the pair's entry has `inProgress` true

#### Scenario: An annual draft marks the pair

- GIVEN a pair whose community has an open draft session on an `ANNUAL` template of the pair's element type
- WHEN the schedule is read
- THEN the pair's entry has `inProgress` true

#### Scenario: Another user's draft marks the pair

- GIVEN user U holds an open `QUARTERLY` draft for a pair, and user W, who can also read the pair, holds none
- WHEN W reads the schedule
- THEN the pair's entry has `inProgress` true, and the entry does not identify U

#### Scenario: A draft on a replaced template version still marks the pair

- GIVEN an open draft frozen against a `QUARTERLY` template version that has since become `retired`
- WHEN the schedule is read
- THEN the pair's entry has `inProgress` true

#### Scenario: MONTHLY and SEMIANNUAL drafts do not mark the pair

- GIVEN a pair whose only open drafts are on `MONTHLY` or `SEMIANNUAL` templates of its element type
- WHEN the schedule is read
- THEN the pair's entry has `inProgress` false

#### Scenario: A draft elsewhere does not mark the pair

- GIVEN an open `QUARTERLY` draft for the same element type in another community
- WHEN the schedule is read
- THEN this pair's entry has `inProgress` false

#### Scenario: Completed and discarded sessions do not mark the pair

- GIVEN a pair whose only sessions are completed ones, or whose only draft was discarded
- WHEN the schedule is read
- THEN the pair's entry has `inProgress` false

#### Scenario: Completing the draft clears the marker

- GIVEN a pair marked in progress by its only open draft, a `QUARTERLY` one
- WHEN that draft is completed and the schedule is read again
- THEN the pair's entry has `inProgress` false, and its status reflects the new covering session

#### Scenario: Status and order are unchanged by a draft

- GIVEN the same pairs read once without any draft and once with an open `QUARTERLY` draft on one of them
- WHEN the two results are compared
- THEN every entry has the same status, driving obligation, deadline, last covering session date and position; only that pair's `inProgress` differs

#### Scenario: The flag counts toward the constant query count

- GIVEN the reader's fixed number of queries, now including the read of open drafts
- WHEN the constant lookup count is measured over 2 and over 20 communities (_Community Names Are Resolved Without Per-Row Lookups_)
- THEN the counts are equal
