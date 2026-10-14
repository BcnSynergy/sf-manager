# Archive Report: login-account-lockout

Archived 2026-10-14 to `openspec/changes/archive/2026-10-14-login-account-lockout/`.

## Specs synced

`authentication`: 1 ADDED ("Login Failure Limiting per Email"), 1 MODIFIED ("Login Attempt Rate Limiting"), 0 removed.

## Final state

- Tasks: all ticked except E.3 (push, PR creation and merge of this archive PR, a user decision).
- Verification: `sdd-verify` PASS WITH WARNINGS, 41/41 scenarios covered (Engram `sdd/login-account-lockout/verify-report`, not copied into this folder).
- Shipped in PRs #214, #215 and #216; this archive is PR 4/4 (#217).
- Registers: TD-31 resolved (PR list includes #217); EN-42 added (no AppModule boot test for invalid `LOGIN_EMAIL_RATE_LIMIT_*`).
