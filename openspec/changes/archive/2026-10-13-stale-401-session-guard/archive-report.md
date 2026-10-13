# Archive Report: stale-401-session-guard

**Archived**: 2026-10-13
**Archive path**: `openspec/changes/archive/2026-10-13-stale-401-session-guard/`
**Artifact store**: hybrid (openspec files canonical, Engram mirror `sdd/stale-401-session-guard/*`)
**Branch**: `stale-401-session-guard/02-archive` (from main at 668c167)

## Outcome

Resolves TD-25. A stale in-flight request that returned 401 after a re-login (or logout and re-login) no longer ends the new, valid web session. Web only; the API is untouched.

- `apps/web/src/api/client.ts`: module-level session epoch and `advanceSessionEpoch()`. `apiFetch` captures the epoch first and skips the unauthorized handler when it changed; the caller still receives `ApiError(401)`.
- `apps/web/src/auth/AuthProvider.tsx`: advances the epoch at login (before `response.json()` and `updateUser`), at logout, and at session end. The mount-time `/auth/me` restore does not advance it (unreachable today; ADR-011 note).
- New whole-flow test `session-ended-flow.test.tsx` (mid-session 401 redirect and notice), plus client and provider tests.
- ADR-011 addendum 2026-10-06 item 6 carries a resolution note.

## Delivery (final state)

| PR | Content | Merge |
|----|---------|-------|
| #210 (PR 1/2) | Epoch guard, advance points, tests, TD-25 resolution, ADR-011 note | 668c167 |
| PR 2/2 (archive) | This change; number not known at writing time | pending |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| authentication | Updated | 2 MODIFIED requirements replaced in full: "Redirect When Unauthenticated (Web)" (4 scenarios) and "Session-Ended Notice (Web)" (7 scenarios). 0 added, 0 removed requirements. |

Scenarios (11 total, checked against the main spec before the merge): 6 new, 2 reworded to "issued under the current session" ("Session ends mid-session", "Mid-session 401"), 3 unchanged ("Unauthenticated visit redirected", "Failed login shows no session-ended notice", "Localized notice"). Previously 5 scenarios in these two requirements.

Composition ran through the native command (zero exit) on LF copies, and the result was converted back to CRLF to match the main spec working copy:

```
gentle-ai sdd-archive-compose --canonical <canonical.md> --delta <delta.md> --output <out.md>
```

`git diff -U0` shows hunks only inside the two modified requirements (new-file lines 370-457); the rest is unchanged. As in the `login-rate-limit-hardening` archive, the delta's "(Previously: ...)" notes were carried into the main spec (the main spec already holds such notes).

## Tasks

Per the persisted `tasks.md` at archive time: Phases A-F are checked. Unchecked: G.1-G.4 (review, push, PR and merge of PR 1/2, which in fact happened: #210 merged) and H.1-H.2 (verify and archive, performed by this cycle). The checkboxes were not rewritten at archive, as required. PR 2/2 review, push and merge remain with the user.

## Verification (final state)

Per `verify-report` (Engram #563, 2026-10-13, after the PR 1/2 merge): PASS, 0 CRITICAL, 0 WARNING, 0 new SUGGESTION. Lint exit 0 (4 pre-existing API warnings), build exit 0, unit web 66 files / 1113 tests and validation 4 files / 50 tests passing. Integration and e2e not run (API unchanged, `git diff bd490a2..668c167 -- apps/api` empty). 11 of 11 scenarios covered. Browser pass (CA locale) covered the golden path and the mid-session 401 notice; the stale-401 race is test-verified only.

## Register Changes

- `docs/technical-debt.md`: TD-25 was already in Resolved citing PR 1/2 (#210) from PR 1; no edit here (the precedent did not add the archive PR to TD entries).
- `docs/enhancements.md`: added EN-14 (defensive epoch advances untested), EN-15 (login advance ordering not pinned), EN-16 (AuthProvider test readability), EN-17 (`vi.unstubAllGlobals` in `session-ended-flow.test.tsx`), EN-18 (spec near-duplicate scenarios and stale archived design open questions), EN-19 (mount-time restore does not advance the epoch; note). Origin `stale-401-session-guard`, 2026-10-13.

## Archive Contents

- explore.md, proposal.md, design.md, tasks.md, verify-report.md: present
- specs/authentication/spec.md: present
- apply-progress: not a file (Engram only, #560)
- archive-report.md: this file

## Archive Readback

The folder was moved with `git mv` after a recursive snapshot; `diff -r <snapshot> <archive folder>` produced empty output (exit 0). The untracked `verify-report.md` moved with it and is still untracked.

## Engram Observation IDs (traceability)

- explore: #553
- proposal: #556
- spec: #557
- design: #558
- tasks: #559
- apply-progress: #560
- verify-report: #563
- PR 1/2 merge decision: #561
- archive-report: `sdd/stale-401-session-guard/archive-report` (saved by this phase)
