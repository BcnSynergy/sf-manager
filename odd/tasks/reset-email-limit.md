# reset-email-limit (EN-200)

Objective: remove the per-email limit on password reset requests so nobody can lock a user out of resetting; keep the per-client-key limit. Branch `reset-email-limit/01-drop-per-email-limit`, delivery `single-pr` (one small PR), test runner Jest (`npm run test --workspace=apps/api`, `npm run test:e2e --workspace=apps/api`).

## Specs

- **S1** (from L2): "Solo límite por cliente": POST `/auth/password-reset/request` is no longer limited per email. Any number of requests naming the same email, from one client key or several, are answered `202` while the per-client-key limit is not reached. The per-client-key limit (default 10 per 15 minutes, `PASSWORD_RESET_RATE_LIMIT_*`) stays on both endpoints unchanged.
- **S2**: `PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS` and `PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS` are no longer read (assumption: a leftover value in an existing `prod.env` is ignored, not a boot error, so an upgrade cannot take the API down). The 429 keeps its body, carries `Retry-After` equal to the per-client-key window, and still no `X-RateLimit-*` headers.
- **S3**: `openspec/specs/authentication/spec.md` "Password Reset Rate Limiting" drops the per-email limit, its variables and the scenario "Per-email limit counts unknown emails too", and records the accepted trade-off (a client with many addresses can send many reset emails to one inbox). README rows and the registers follow (EN-200 to Done; the EN-201 parts about the per-email guard become moot).

## Tasks

- T1 — S1-S3 — inline (no writer trigger: one understood unit) — done — RED 3 e2e (202 expected got 429; Retry-After 600 got 3600; boot with leftover var) → GREEN; commits: e83d360, follow-up (S-1..S-3 tests)

## Log

- L1 (2026-11-18, user): "si, en la red actual el puerto 22 esta bloqueado, vamos con la decision de EN-200"
- L2 (2026-11-18, user, AskUserQuestion answer): "Solo límite por cliente (Recommended)" — accepted trade-off: a rotating-IP attacker can flood a victim's inbox with reset emails (nuisance, no account access).
- L3: Risk item 2 (security: rate-limit guard on a public auth endpoint) → independent verifier after checks, then fresh-reviewer before push.
- L4 (2026-11-18): T1 GREEN. Checks: tsc clean, lint clean, api unit 1852/1852, api e2e 587/587. Specs changed: authentication ("Password Reset Rate Limiting"). Registers: EN-200 Done; EN-201 trimmed.
- L5 (2026-11-18): fresh-reviewer APPROVE (no blockers; S-1..S-3 suggestions). Gentle native review (risk, reliability) approved and acknowledged, lineage review-9b2521143bc95b63, target e83d360. T1 follow-up commit applies S-1..S-3: 4 same-email requests, confirm 429 Retry-After 600 and no X-RateLimit-*, S1 wording.
