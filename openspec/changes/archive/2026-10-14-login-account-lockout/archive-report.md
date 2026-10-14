# Archive Report: login-account-lockout

Archived 2026-10-14 to `openspec/changes/archive/2026-10-14-login-account-lockout/`.

## Specs synced

`authentication`: 1 ADDED ("Login Failure Limiting per Email"), 1 MODIFIED ("Login Attempt Rate Limiting"), 0 removed.

## Final state

- Tasks: all ticked except E.3 (push, PR creation and merge of this archive PR, a user decision).
- Verification: `sdd-verify` PASS WITH WARNINGS, 41/41 scenarios covered (Engram `sdd/login-account-lockout/verify-report`, not copied into this folder).
- Shipped in PRs #214, #215 and #216; this archive is PR 4/4 (#217).
- Registers: TD-31 resolved (PR list includes #217). Added across the chain: TD-36; EN-23, EN-24 and EN-29 to EN-38 (PR 3/4); EN-39 to EN-41 (PR 3/4 review findings registered in this archive PR rather than in PR 3/4, to avoid another review round there); EN-42 (no AppModule boot test for invalid `LOGIN_EMAIL_RATE_LIMIT_*`). EN-25, EN-27 and EN-28 were added in PR 1/4; EN-26 was added and moved to Done in PR 1/4; EN-6 was extended in PR 1/4.
