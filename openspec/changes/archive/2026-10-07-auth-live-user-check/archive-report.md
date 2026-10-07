# Archive Report: auth-live-user-check

**Change**: auth-live-user-check - live user check on every authenticated request (tech-debt #3)
**Archived**: 2026-10-07
**Archived to**: `openspec/changes/archive/2026-10-07-auth-live-user-check/`
**Mode**: hybrid (filesystem merge plus Engram report)
**Verdict carried from sdd-verify**: PASS WITH WARNINGS - 0 CRITICAL, 2 WARNING, 3 SUGGESTION. Archived as **intentional-with-warnings**: the warnings are non-blocking and are carried below.
**Engram traceability**: explore `sdd/auth-live-user-check/explore` (#452), scope decision (#453), proposal `sdd/auth-live-user-check/proposal` (#454), spec `sdd/auth-live-user-check/spec` (#455), design `sdd/auth-live-user-check/design` (#456), tasks `sdd/auth-live-user-check/tasks` (#457), apply-progress `sdd/auth-live-user-check/apply-progress` (#458), PR 1 merge (#459), main CI green (#461), PR 2 merge (#462), verify-report `sdd/auth-live-user-check/verify-report` (#463, mirrored in `verify-report.md`).

## Summary

`AuthenticatedGuard` used to trust the JWT claims for up to 2 hours: a soft-deleted user kept full access, and a role or email change was ignored until the token expired. The guard now looks the user up by `payload.sub` on every authenticated request (after signature and denylist checks, inside the fail-closed `try/catch`). A missing or soft-deleted user, or a failed lookup, gets a bare 401 that is indistinguishable from an invalid token. `role` and `email` on `request.user` come from the stored user, not the token. On the web, any data-call 401 mid-session ends the local session, redirects to `/login` and shows a localized, reason-free notice ("Your session has ended. Please sign in again." in EN, ES and CA). The web part is the minimal UI the slice needed (CLAUDE.md "every slice includes its own UI").

## Task Completion Gate

Read `tasks.md` before the archive. A.1-A.11 and B.1-B.9 were `[x]` already. At archive the orchestrator-owned boxes were ticked with evidence: G.1 (fresh reviews and green CI), C.1 (verify) and C.2 (this archive). All tasks are complete.

## Preconditions confirmed

- Verify verdict PASS WITH WARNINGS with 0 CRITICAL: archive allowed.
- Both implementation PRs merged; CI green on both PR runs and on the push to `main`.
- B.9 browser verification done (2026-10-07), so the web part is browser-verified, not only test-verified.

## Specs Synced

| Capability | Action | Requirements |
|---|---|---|
| `authentication` | Updated (delta merged into the existing main spec) | 2 ADDED, 3 MODIFIED, 0 REMOVED |

- **ADDED**: Live User Check on Authenticated Requests (placed after Session Introspection); Session-Ended Notice (Web) (placed after Redirect When Unauthenticated).
- **MODIFIED** (replaced entirely, same name): Protected Endpoint Access Control (adds the live-user condition and a "user missing or soft-deleted" scenario); Session Introspection (`GET /auth/me`) (`role` and `email` are stored values; adds "Role changed after login" and "Soft-deleted user" scenarios); Redirect When Unauthenticated (Web) (adds the mid-session scenario).

Main spec file: `openspec/specs/authentication/spec.md`. All other requirements were left untouched.

## Delivered PRs (stacked-to-main)

| PR | Result |
|---|---|
| #193 `auth-live-user-check/01-guard-live-user-check` | Merged at `d1a44b3` (2026-10-06). Guard live check, e2e suites, ADR-011 addendum, comment fixes. User-accepted size exception (code +53/-28, tests +309/-98, ADR +29, openspec +548) |
| #194 `auth-live-user-check/02-web-session-ended` | Merged at `96856a8` (2026-10-07). `setUnauthorizedHandler`, `AuthProvider` `sessionEnded` flag, login notice, EN/ES/CA strings. User-accepted size exception (code ~83, tests ~360, openspec ~98) |
| `auth-live-user-check/03-archive` (PR 3/3) | This archive: delta merge, ADR-011 open question, archive move |

## Workflow runs

| Run | Subject | Result |
|---|---|---|
| 37516717748 | PR #193 | success |
| 37517372150 | push main `d1a44b3` | success |
| 37583375940 | PR #194 | success |
| 37588733570 | push main `96856a8` | success |

## ADR updates

- ADR-011: the 2026-10-06 addendum (written with PR #193) supersedes item 1 of the 2026-08-22 addendum and the role-staleness note in the 2026-09-09 one. At archive, item 6 was added as an open question: the stale in-flight 401 after a re-login, plus the missing integrated test of the mid-session redirect.

## Archive Contents

- `proposal.md`, `explore.md`, `design.md`, `tasks.md`, `apply-progress.md`: yes, as present in the change folder
- `specs/authentication/spec.md`: yes (the delta)
- `verify-report.md`: yes
- `archive-report.md`: yes (this file)

## Warnings carried forward

- **W-1**: There is no single automated test of the mid-session 401 followed by the redirect to `/login`. The flag is tested in `AuthProvider.test` and the redirect in `ProtectedRoute.test`; the whole flow was browser-verified (B.9). A router-level integration test would close the gap.
- **W-2**: A stale in-flight data request sent before a re-login that returns 401 after the new login would end the new, valid web session, because the handler acts whenever a user is set. Low likelihood. Recorded as an open question in ADR-011.

### Accepted suggestions

- **S-1**: "Public endpoints unaffected" is proven at guard unit level only. An e2e test with a lookup spy on `/health` or login would prove it at HTTP level.
- **S-2**: The TDD Cycle Evidence tables use a custom RED/GREEN/REFACTOR shape without the Triangulate and Safety Net columns. Content is adequate; only the format differs.
- **S-3**: `tasks.md` checkboxes G.1, C.1 and C.2 were stale: done at this archive.

## Follow-ups and deferred items (open, NOT to do now - ADR-006)

1. Stale-401 session epoch: capture an epoch when a request starts and check it in the `AuthProvider` handler (W-2).
2. Router-level integration test for mid-session 401 to `/login` (W-1).
3. HTTP-level test for public endpoints with a lookup spy (S-1).
4. From the ADR-011 addendum, still deferred: per-user invalidation epoch and refresh tokens, a lookup cache, de-duplicating the capability checker's own read, dropping the token claims, and a live UI role refresh.
5. Residual by design: a request already in flight when the user is deleted still completes, and a deleted user's own `POST /auth/logout` returns 401.

## Dev-DB note

The QA user `qa_test@sf-manager.example`, created during B.9 browser verification, was left soft-deleted in the dev database (with the user's OK, per apply-progress). It is QA data, not seed data. A `prisma migrate reset` plus `prisma db seed` clears it.

## Source folder removal and commit

The `sdd-archive` executor has no Bash access. All content was written in place under `openspec/changes/auth-live-user-check/`. The orchestrator moves the folder with `git mv` to `openspec/changes/archive/2026-10-07-auth-live-user-check/` and commits on branch `auth-live-user-check/03-archive`. After the move, `openspec/changes/auth-live-user-check/` no longer exists.

## SDD Cycle Complete

The change has been fully planned, implemented, verified and archived. `auth-live-user-check` is closed.
