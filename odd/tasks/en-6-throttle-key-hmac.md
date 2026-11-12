# EN-6 — HMAC for throttle counter keys

Objective: key the stored and logged throttle counter keys with a server secret (HMAC-SHA-256) instead of an unsalted SHA-256.
Branch: `en-6-throttle-key-hmac/01-hmac` (single PR, stacked-to-main). Runner: Jest (`npm test`, `npm run test:e2e`, `npm run test:integration` in `apps/api`).

## Specs

- S1 (from EN-6): "Hash the throttle key with an HMAC (secret-keyed) instead of the library's unsalted SHA-256." Covers the per-client-key counters (`PrismaThrottlerStorage`) and the per-email counters (`PrismaLoginFailureLimiter`). "An HMAC should cover both the stored key and the logged value."
- S2 (user decision 2026-11-12, "Nueva variable"): the secret is a new required variable `THROTTLE_KEY_SECRET`, separate from `JWT_SECRET`. The API refuses to boot without it. Wired in `docker-compose.prod.yml`, `prod.env.example`, `apps/api/.env.example`, the smoke test, README and the tests.
- S3 (user confirmed spec edit 2026-11-12): `openspec/specs/authentication/spec.md` requires a keyed hash with a server secret for the email and the client key, at rest and in logs; `openspec/specs/deployment/spec.md` lists `THROTTLE_KEY_SECRET` as required.
- Assumption: no data migration. Counter rows live at most one window; old unkeyed rows expire and are cleaned up, and blocks active at deploy time are lost once.

## Tasks

| ID  | Specs | Route  | Status | Evidence                                                                                                                                                                    |
| --- | ----- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | S1-S3 | inline | done   | d0fa5aa; RED: config spec (module missing), integration "keys both counters" (email key was unkeyed SHA-256); GREEN: unit 1769, e2e 564, integration 284, smoke test exit 0 |

## Log

- L1 (2026-11-12, user): "dame opciones segun impacto" → chose EN-6 after deferring EN-91 ("si no tenemos servidor no seria mejor empezar por otro punto…"); "si" to EN-6.
- L2 (2026-11-12, user): HMAC key source = "Nueva variable (Recomendado)"; spec question answered "si".
- L3: Risk items 1 (persisted key format), 2 (secret) and 3 (new required env var for the deployment config).
- L4 (2026-11-12): `apps/api/.env.example` is permission-denied for the agent; the user added `THROTTLE_KEY_SECRET` there and in their local `.env`.
- L5 (2026-11-12): native review (risk, readability, reliability) granted, approved and acknowledged on d0fa5aa (lineage review-6bdd0b2c1c8270c5). Fixed in a follow-up commit: R2-004/R3-001 (try/finally in the new integration test), R2-002 (comment reflow). Registered: EN-180 (R1-001, R3-002 secret minimum), EN-181 (R2-001 single hasher provider). R2-003 (PR #TBD, task status) resolved when the PR number is known.
- L6 (2026-11-12): native review of d5d6bba approved and acknowledged (lineage review-1eda6cdcbb929596); advisories R3-001, R2-001/R3-002 on the test's env restore not chased (noted in the PR). Fresh review (Opus, worktree, probes P1-P6 all caught): APPROVE, no blockers or warnings. Applied S-1 (spec "MUST NOT" wording); S-2 folded into EN-181.
