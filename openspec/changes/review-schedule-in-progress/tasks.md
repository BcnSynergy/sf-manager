# Tasks: Review schedule in-progress marker (TD-22)

## Review Workload Forecast

| Area                  | Estimate  |
| --------------------- | --------- |
| API source            | ~40 lines |
| API tests             | ~140      |
| Web source and i18n   | ~25       |
| Web tests             | ~50       |
| Specs and registers   | ~20       |
| **Total (excl. SDD)** | **~275**  |

Under the 400-line budget: one implementation PR plus the archive PR.

### Suggested Work Units

- PR 1/2 `review-schedule-in-progress/01-draft-marker`: phases A-F.
- PR 2/2 `review-schedule-in-progress/02-archive`: phase H.

## Phase A: Branch and baseline (PR 1)

- [x] A.1 Branch from `main`; baseline `npm run test --workspace=apps/api`,
      the review-schedule integration spec, and `apps/web` Vitest green.

## Phase B: Reader (spec: An Open Draft Marks a Pair as In Progress)

- [x] B.1 RED: integration tests for quarterly draft, annual draft, another
      user's draft, retired-version draft, MONTHLY/SEMIANNUAL drafts, draft in
      another community, completed-only and discarded, completing a draft.
- [x] B.2 RED: query-count test expects seven.
- [x] B.3 GREEN: `SchedulePair.inProgress`, q7 with its structural type
      signature (Decision 2), fold, header comment.

## Phase C: Use case (spec: status and order unchanged)

- [x] C.1 RED: flag copied per pair; same pairs sort and evaluate identically
      with the flag true or false.
- [x] C.2 GREEN: `ReviewScheduleRow.inProgress` set in `.map`.

## Phase D: HTTP (spec: the entry carries `inProgress`)

- [x] D.1 RED: e2e DTO shape includes `inProgress`.
- [x] D.2 GREEN: DTO field and controller mapping.

## Phase E: Web (spec: An In-Progress Row Shows a Marker)

- [x] E.1 RED: page shows the marker for a flagged row only, in en/es/ca; the
      marker is not a control.
- [x] E.2 GREEN: row type, `IN_PROGRESS_LABEL_KEY`, marker span, locale keys.

## Phase F: Registers and verification (PR 1)

- [x] F.1 TD-22 to Resolved (with PR number after the PR exists).
- [x] F.2 Full suites: API unit, API e2e, review-schedule integration, web;
      `npm run build`, `npm run format:check`, lint.
- [x] F.3 Browser pass: seeded draft's row shows the marker; other rows do not.
- [x] F.4 verify-report.md.

## Gate PR 1 (orchestrator)

- [ ] Native review (if due), fresh-context review, push, PR, CI, merge —
      each confirmed with the user.

## Phase H: PR 2 — archive (branch `review-schedule-in-progress/02-archive`)

- [ ] H.1 Merge delta specs into `openspec/specs/review-schedule` and
      `review-schedule-ui`; Purpose sentence (design Decision 5).
- [ ] H.2 Move the change to `openspec/changes/archive/2026-10-16-review-schedule-in-progress/`
      with archive-report.md; register any non-blocking findings.
