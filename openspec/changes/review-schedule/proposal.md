# Proposal: Review Schedule — Overdue and Upcoming Reviews (FR-009, slice 1)

## Intent

FR-009 is `identified`. Sessions are recorded and signed, but nothing
tells anyone **where a review is needed now**. RIPCI requires one review
per calendar quarter per `(community, elementType)`, plus an `ANNUAL`
review at most 12 months after the previous one. Today that is tracked
outside the system, or not at all.

This slice ships one read-only list. For each `(community, elementType)`
in the caller's scope it shows whether a review is **overdue**,
**upcoming**, **never reviewed** or **up to date**. It is computed on
read from completed sessions. It adds no schema change, no reminders and
no stored projection.

Success: a representative opens **Review schedule** and sees which of
their communities need a review this quarter, and which missed the last
one.

Per ADR-006's 2026-08-25 addendum, the minimal web UI ships **in this
change**.

Context: `[[sdd/review-schedule/explore]]`,
`[[sdd/review-schedule/product-decision*]]` (decisions 1–9), ADR-006,
ADR-008, ADR-010, ADR-011, FR-009,
`docs/architecture/domain-model-inspections.md:376-393`.

## Settled product decisions

These were closed with the product owner on 2026-10-01 and 2026-10-05.
They are inputs to this proposal, not open items. Decisions 3 and 5 were
revised, and decisions 10 and 11 were added, in the proposal question
round (see below).

| # | Decision | Rule |
|---|---|---|
| 1 | Due rule | The documented RIPCI policy applies. A pair needs one session per calendar quarter. An `ANNUAL` session may fall in any quarter and substitutes that quarter's `QUARTERLY` one. Consecutive `ANNUAL` sessions may be at most 12 months apart, counted from the real date of the last one. |
| 2 | What covers a quarter | Only a **completed** session whose template frequency is `QUARTERLY` or `ANNUAL`. `MONTHLY` and `SEMIANNUAL` never count. |
| 3 | Dev seed (extended) | The EXTINGUISHER × `MONTHLY` template is **replaced** by EXTINGUISHER × `QUARTERLY`. The seed **also adds** an EXTINGUISHER × `ANNUAL` template and one completed `ANNUAL` session in one community (for example Dev Seed Residences North). Dev then shows North as UP_TO_DATE and South as UPCOMING, because South has no annual on record. This ships as PR 1. Existing dev databases need `migrate reset` plus `db seed`. |
| 4 | Statuses | **OVERDUE**: the previous quarter is uncovered (under the decision 5 conditions), **and** the current quarter is still uncovered (condition c; once it is covered, a missed previous quarter is no longer reported), or the 12-month annual deadline has passed. **UPCOMING**: the current quarter is not yet covered, or the annual deadline falls before the end of the current quarter. **UP_TO_DATE**: everything else. There is no configurable window. |
| 5 | Lookback (corrected) | A pair is quarterly-OVERDUE only if both hold: (a) the immediately previous quarter is uncovered, **and** (b) the pair has a completed `QUARTERLY`/`ANNUAL` session dated **before** that previous quarter. Known history starts at the first covering session, and earlier quarters are never judged. (revised 2026-10-05: a third condition applies, see decision 4.) With Q4 as the current quarter: a first session in Q2 with Q3 uncovered is OVERDUE; a first session in Q3 means Q3 is covered; a first session in Q4 is not overdue. |
| 6 | No history | A pair with no completed `QUARTERLY`/`ANNUAL` session ever is **NEVER_REVIEWED**. It is actionable but makes no overdue claim. A pair with quarterly coverage but no `ANNUAL` on record has its annual obligation UPCOMING. |
| 7 | Roles | `SYSTEM_ADMIN`: all communities. `MANAGER`: all with `VIEW_ALL_REVIEWS`, otherwise empty (fails closed). `COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_TECHNICIAN`: their **assigned** communities. For technicians this is assignment-based, deliberately unlike the performer-based history. `MAINTENANCE_COMPANY_MANAGER`: out of slice, `403` and no nav entry. |
| 8 | Drafts | Drafts never cover a quarter. This slice has no "in progress" marker. |
| 9 | Granularity | Coverage is computed per `(community, elementType)` pair, not per element. A pair exists when the community has at least one active, non-deactivated element of that type. |
| 10 | Listing | The list shows **every** pair in scope, UP_TO_DATE included. It is sorted worst to best: OVERDUE, then NEVER_REVIEWED, then UPCOMING, then UP_TO_DATE. Slice 1 has no filter control. |
| 11 | Combined status | Each pair has **one** status: the worse of its quarterly and annual statuses. NEVER_REVIEWED is exclusive. The row shows the reason and deadline of the obligation that drives the status, plus the date of the last covering session. It uses one line of reason text, for example "Upcoming: annual review due by 31/12/2026" or "Overdue: Q3 2026 not covered". |

## Scope

### In Scope

- **Due calculation (API)**: a pure domain function that maps a pair's
  completed `QUARTERLY`/`ANNUAL` sessions and `now` to one combined
  status, together with the obligation that drives it (its reason and
  deadline). It covers calendar-quarter boundaries, the known-history
  start (decision 5) and the 12-month annual deadline.
- **Schedule read (API)**: one scoped, read-only `GET` that returns
  **every** pair in scope, sorted worst to best (decision 10). Each row
  has the community name, element type, combined status, driving reason
  and deadline, and the date of the last covering session. Scope comes
  from the existing checker ports. Community names are looked up in one
  batch, with no N+1.
- **Schedule page (web)**: one page with loading, empty, error and table
  states. Each row shows its status and a one-line reason (decision 11).
  The page has no filter control. It adds one route, one nav item for the
  four in-scope roles, and `en`/`es`/`ca` keys.
- **Dev seed (PR 1)**: the `MONTHLY` template is replaced by `QUARTERLY`.
  An EXTINGUISHER × `ANNUAL` template and one completed `ANNUAL` session
  in Dev Seed Residences North are added. Follow-on edits go to
  `README.md` and the `CLAUDE.md` dev-data bullet.
- **Docs**: FR-009 changes to `partial` in the final PR.
- Unit tests at the boundaries (quarter edges, the 12-month edge, drafts,
  `MONTHLY`/`SEMIANNUAL` exclusion), integration tests for the aggregate
  read, E2E tests over the role matrix, and browser verification.

### Out of Scope

- Reminders, email, queues and scheduled jobs. No infrastructure for
  them exists.
- Per-element due dates, a "last inspected" display, and any stored
  `lastInspectedAt`.
- Configurable windows or intervals, overrides, snoozes and calendar
  views.
- Filters, sorting, pagination and search.
- Older gaps (two or more quarters back) and historical compliance
  reports.
- Scope for `MAINTENANCE_COMPANY_MANAGER`, and any link between a company
  and a community.
- An "in progress" marker for open drafts.
- Wiring the schedule into session creation (FR-007's "what is due"
  hint).

## Capabilities

### New Capabilities

- `review-schedule`: the due rule, the four statuses, the role scopes
  (including the company-manager `403`), the read-only computed-on-read
  guarantee, and the batched name lookup.
- `review-schedule-ui`: the schedule page and its states, route, nav
  placement and i18n.

### Modified Capabilities

| Capability | Delta needed (verified) |
|---|---|
| `dev-seed-data` | In *Dev Dataset Contents* (`:68`) and the fail-soft scenarios (`:185`, `:194`), EXTINGUISHER × `MONTHLY` becomes `QUARTERLY`. *Dev Dataset Contents* also gains an EXTINGUISHER × `ANNUAL` template and one completed `ANNUAL` session in one community. Idempotency and fail-soft coverage extend to the added rows. |
| `review-session-management` | The FR-009 row (`:531`) and *No scheduling or due-date logic exists* (`:566-569`) are written globally. Narrow both to **this capability's own surface**, with a "(Previously: …)" note. The FR-008 row (`:530`) says the manager capability "MUST affect the `review-history` read only". Narrow it to also allow the schedule read. |
| `review-history` | The deferred table under *The Deferred Review Visibility Scopes Are Not Built* has three rows to narrow. `:1062-1064` and `:1076` allow capability gating of review-history reads only. `:1077` forbids a third actor-unscoped session query. `:1081` forbids any cross-community aggregation. Allow the schedule read explicitly, as a bound and not a deletion. |
| `authorization` | `:445` says `VIEW_ALL_REVIEWS` "MUST gate review-history visibility only". Narrow it. The new `reviewSchedule:read` permission also changes `ROLE_PERMISSIONS` and the *MANAGER holds one permission* scenario (`:1474`), which requires exactly `['reviewSession:read']`. |
| `app-navigation` | The fixed role-to-items table (`:96-102`) gains **Review schedule** for four roles. The company manager stays unchanged. |

Spec and design review later added these deltas (2026-10-05):

- `review-history-ui` and `review-session-ui`: both count navigation
  links as controls, and their "no rollup" and "no global review view"
  clauses could be read as covering the schedule. Each delta permits the
  global **Review schedule** nav item and narrows those clauses to lists
  of reviews or sessions.
- `user-admin-ui`: the `VIEW_ALL_REVIEWS` label now also covers the
  schedule.
- `review-document`: a "no permission is added" scenario is scoped to its
  own read.
- `authorization`, `app-navigation` and `review-history`: further
  clauses that pinned exact permission sets, item counts or "history
  only" now have explicit rewrites.

## Approach

> Settled in `design.md` (2026-10-05). Design decisions supersede the
> open choices below. The read shape, the `Clock` port, the permission, the
> time zone and the PR split are all fixed there.

- **A pure function plus a thin use case.** The status rule is a pure
  function of `(sessions, now)`. Time is injected through a new `Clock`
  port or a `now` argument. The exploration found no clock abstraction
  and no fake timers in `apps/**`.
- **A module-local read port.** One aggregate read returns the completed
  `QUARTERLY`/`ANNUAL` sessions per pair (latest two quarters plus the
  last `ANNUAL`). It joins the frozen template row, so replacing a
  template version does not reset the clock. It follows the
  `PrismaReviewDocumentNameDirectory` precedent and leaves the
  review-session port's "exactly two unscoped methods" bound intact.
- **Reuse the scope checkers, not the history `switch`.** Technicians
  resolve through `listAssignedCommunityIds`. The read fails closed
  before any repository call.
- **Permission: new `reviewSchedule:read`.** The company
  manager holds `reviewSession:read` (`role-permission.checker.ts:69`).
  Reusing it would need an in-use-case role refusal to produce the
  `403`. A permission not granted to that role gets the `403` from the
  guard. Settled in design: new `reviewSchedule:read`.
- **Quarter boundaries in `Europe/Madrid`**, following the review-export
  date precedent. Settled in design (the precedent is web-only).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/src/shared/seeding/**` | Modified | Template frequency changes to `QUARTERLY` |
| `apps/api/src/modules/review-session/**` (design: a new `review-schedule` module) | New | Due function, `Clock`, read port with Prisma adapter and fake, use case, controller, DTO |
| `apps/api/src/shared/application/authorization/permission.ts`, `apps/api/src/modules/auth/infrastructure/authorization/role-permission.checker.ts` | Modified | Adds `reviewSchedule:read` (settled in design) |
| `apps/web/src/pages/ReviewSchedulePage.tsx`, `apps/web/src/api/review-schedule.ts` | New | Page and client |
| `apps/web/src/layout/nav-items.ts`, `apps/web/src/routes/authenticated-routes.tsx` | Modified | Nav item and route for four roles |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Schedule and status keys |
| `README.md`, `CLAUDE.md`, `docs/requirements/functional-requirements.md` | Modified | Seed notes, FR-009 changes to `partial` |

No schema change and no migration.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ~~A first session in the current quarter reads as OVERDUE.~~ **Resolved** by corrected decision 5: a pair is overdue only when it has a covering session before the previous quarter. | — | Boundary tests for the three decision 5 examples |
| ~~UP_TO_DATE is unreachable without an `ANNUAL` session.~~ **Resolved** by extended decision 3: the seed adds an `ANNUAL` template and session, so dev shows UP_TO_DATE (North) and UPCOMING (South). | — | Browser verification of both states |
| Widening `VIEW_ALL_REVIEWS` beyond history contradicts four spec clauses | Certain | Narrowing deltas listed above, "(Previously: …)" style |
| A wrong boundary produces a misleading compliance list | Med | Pin the rules in the spec and add table-driven boundary tests |
| Element types with active elements but no `QUARTERLY`/`ANNUAL` template stay NEVER_REVIEWED forever | Med | Accepted under decision 6. Named in the spec. |
| Scope creep into reminders, per-element views or filters | High | Explicit non-goals, checked by `sdd-verify` |
| Existing dev databases keep the `MONTHLY` template | Certain | `migrate reset` plus `db seed`, with explicit user consent (CLAUDE.md) |

## Proposal question round

**Closed on 2026-10-05.** The user answered all four questions, and the
answers are recorded in *Settled product decisions*.

| # | Question | Outcome |
|---|---|---|
| 1 | Does a first-ever covering session in the current quarter make the pair OVERDUE? | No. Decision 5 was corrected to judge only known history. |
| 2 | Is UP_TO_DATE unreachable without an `ANNUAL` session, including in dev? | The rule stands. Decision 3 was extended so the seed adds an `ANNUAL` template and session. |
| 3 | Does the list show every pair, or only actionable ones? | Every pair, sorted worst first, with no filter (decision 10). |
| 4 | Is there one combined status per pair? | Yes. The worse obligation wins, and the row shows its reason, deadline and last covering session (decision 11). |

## Open questions (later slices)

- Company-manager scope, once a company-to-community link exists.
- An "in progress" marker for pairs with an open draft.
- An element added after the quarter's session (decision 9).
- Reminders (the second half of FR-009).

## Size estimate

Large: roughly 2,000–3,000 changed lines including tests and three
locales. Stacked-to-main, about 6–8 PRs at proposal time. The design
forecasts 9 PRs and about 2,900 lines, and supersedes the list below. The
final count is set at `sdd-tasks`.

1. Seed change (`QUARTERLY` replaces `MONTHLY`, plus an `ANNUAL` template
   and session), with the dev-seed-data delta
2. `Clock` and the pure due function
3. Read port, Prisma adapter and integration spec
4. Use case, scoping and controller, with E2E role matrix
5. Permission and nav or route wiring
6. Schedule page and i18n
7. Docs and archive

## Rollback Plan

Revert the PRs in reverse order. There is no schema change and no
persisted state, so behaviour is restored exactly. If PR 1 is reverted,
dev databases need another `migrate reset` plus `db seed` to return to
`MONTHLY`.

## Dependencies

- None new. The change reuses the scope checker ports, the
  `ManagerCapabilityChecker` and the review-history page patterns.
- Seeded users for the four in-scope roles, plus the company manager for
  the `403` check, are needed for browser verification.

## Success Criteria

- [ ] Each of the four in-scope roles sees exactly its scoped pairs. An
      ungranted `MANAGER` sees an empty list. The company manager gets
      `403` and has no nav item.
- [ ] Boundary tests prove each status: quarter edges, the 12-month
      annual edge, `ANNUAL` substituting for `QUARTERLY`, the three
      known-history examples of decision 5, the settled condition (c) of decision 4
      (a missed previous quarter is OVERDUE only while the current quarter is
      uncovered; revised 2026-10-05), and `MONTHLY`/`SEMIANNUAL`/draft
      sessions never covering.
- [ ] NEVER_REVIEWED appears only for pairs with no completed
      `QUARTERLY`/`ANNUAL` session.
- [ ] Every pair in scope is listed, sorted OVERDUE, then NEVER_REVIEWED,
      then UPCOMING, then UP_TO_DATE. Each row shows the reason and
      deadline of its driving obligation and the last covering session
      date. There is no filter control.
- [ ] Pairs with only deactivated or deleted elements, and soft-deleted
      communities, do not appear.
- [ ] No schema change, no stored projection, no reminder code.
- [ ] After reset and seed, the seed holds EXTINGUISHER × `QUARTERLY` and
      EXTINGUISHER × `ANNUAL` templates and no `MONTHLY` template. In the
      browser, Dev Seed Residences North shows UP_TO_DATE and Dev Seed
      Residences South shows UPCOMING (annual review due).
- [ ] Zero hardcoded strings, with real `en`/`es`/`ca` values. Suites,
      lint and build pass. The page is **browser-verified**.

## Next step

Run `sdd-tasks`. Spec and design are done and passed judgment-day on
2026-10-05. The proposal question round is closed.
