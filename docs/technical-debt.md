# Technical Debt

Register of known technical debt in SF-Manager: shortcuts, gaps, and deferred
work that make the system harder to change, operate, or trust. Improvements
that add value without fixing a defect or gap live in
[enhancements.md](enhancements.md).

## How to use this file

- Each item has a stable ID (`TD-<n>`). IDs are never reused or renumbered.
  Commits, PRs, ADRs, and SDD artifacts refer to items by this ID.
- New items go at the end of the matching severity section with the next free
  number. Include the evidence (file path, line, or source review) and the
  origin (which change or review found it).
- When an item is resolved, move it to **Resolved** with the change name and PR
  numbers. Do not delete it.
- Severity: **Medium** affects users, security, or correctness; **Low** affects
  maintainability, test quality, or operations.

Inventory first verified 2026-10-06 at `main` `b0276b7`; migrated from the
project's Engram memory on 2026-10-09.

## Open

### Medium

None open.

### Low

- **TD-5**: No refresh-token rotation.
- **TD-8**: The web app ships as a single ~830 kB chunk.
- **TD-9**: Four `as any` lint warnings in `auth.controller.spec.ts`.
- **TD-11**: The `MANAGE_COMMUNITIES` fixture in the validation
  `update-user.schema.spec.ts:25`.
- **TD-10** (verify if still relevant): The ADR-011 Decision 3 pointer is
  effectively superseded by the 2026-10-06 addendum.
- **TD-12**: No compile-time check for `ManagerCapability`.
- **TD-13**: Review schedule rows have no test IDs.
- **TD-15**: No real-repository test for a soft-deleted manager.
- **TD-16**: The e2e guard allowlist is maintained by hand.
- **TD-17**: `ReviewDocumentPage` falls back to the raw `questionId`.
- **TD-18**: Review-export test-quality findings W-4, S-5, and S-6.
- **TD-19**: Hermetic-integration-tests findings W3, S3, and S6.
- **TD-20**: The dev-seed finish-draft window.
- **TD-22**: In-progress marker.
- **TD-23**: TDD evidence tables.
- **TD-24** (unverified): Review-history coverage findings W1 and W3.
- **TD-25**: A stale in-flight 401 after re-login ends the new web session.
  A session epoch would fix it (ADR-011 addendum, item 6). Origin:
  `auth-live-user-check`.
- **TD-26**: No integrated test of the mid-session 401 → `/login` redirect.
  Origin: `auth-live-user-check`.
- **TD-27**: The public-endpoint "no lookup" behavior is proven at unit level
  only. Origin: `auth-live-user-check`.
- **TD-28**: The production `TRUST_PROXY` value depends on the deployment
  topology; a CDN plus a proxy (two hops) needs a numeric hop count. Origin:
  `login-rate-limit` (ADR-011 open questions).
- **TD-29**: IPv6 clients can rotate the low 64 bits to get fresh rate-limit
  buckets; keying on the /64 may be needed. Origin: `login-rate-limit`.
- **TD-30**: In-memory throttle counters reset on every restart. Origin:
  `login-rate-limit`.
- **TD-31**: Account lockout and per-email rate-limit keying are deferred.
  Origin: `login-rate-limit`.
- **TD-32**: CI scope deferred by `ci-pipeline` (ADR-006): deploy, coverage
  upload, matrix builds, Dependabot, Playwright, extra caching, a typecheck
  script, parallel jobs, and SHA-pinned actions.
- **TD-33**: Prettier is a dependency but is not enforced: there is no format
  script or CI step, and `main` already fails `prettier --check` (for example
  `apps/web/src/index.css`). Origin: `table-accessibility` review, 2026-10-09.
- **TD-34**: Stale wording in `docs/adr/INDEX.md`: it says most slices are
  API-only and that i18n tooling is undecided.

## Resolved

- **TD-1**: No CI. Resolved by `ci-pipeline` (#189, #191, #192; ADR-017).
- **TD-2**: Lint `--fix`. Resolved in #188.
- **TD-3**: Stale token after soft-delete or role change. Resolved by
  `auth-live-user-check` (#193, #194, #195; ADR-011 2026-10-06 addendum).
- **TD-4**: No login rate limiting. Resolved by `login-rate-limit` (#196,
  #197; ADR-011 2026-10-07 addendum).
- **TD-6**: A signer lost access to their own document after being
  unassigned. Resolved by `representative-retained-access` (#200, #201).
- **TD-7**: Web i18n hardcoded to English, with no language selector.
  Resolved by `web-locale-switch` (#198, #199).
- **TD-14**: Web tables had no caption or `scope="col"`. Resolved by
  `table-accessibility` (#203, #204).
- Earlier, before numbering: export S-1 and S-2, manager-cap S4, W2, and the
  hermetic Jest version skew.

TD-21 does not appear in the migrated inventory. TD-32 and TD-34 were
unnumbered in the inventory and got IDs during the migration; TD-33 is new.
