# EN-180 — Secret strength at boot

Objective: refuse to start on weak `JWT_SECRET` / `THROTTLE_KEY_SECRET` values.
Branch: `en-180-secret-strength/01-validate` (PR #409, stacked-to-main). Runner: Jest (`npm test`, `npm run test:e2e`, `npm run test:integration` in `apps/api`).

## Specs

- S1 (EN-180): "Enforce a minimum length (and reject a value equal to `JWT_SECRET`) at boot"; "`JWT_SECRET` has no minimum either, so consider both together."
- S2 (user decision 2026-11-12, "Ambos secretos (Recomendado)"): both secrets need at least 32 characters and no leading or trailing whitespace; `THROTTLE_KEY_SECRET` must differ from `JWT_SECRET`. Error messages name the variable and never echo the value.
- S3 (user confirmed spec edit 2026-11-12): `openspec/specs/deployment/spec.md` gains "Secret strength" with its scenarios.

## Tasks

| ID  | Specs | Route  | Status | Evidence                                                                                                 |
| --- | ----- | ------ | ------ | -------------------------------------------------------------------------------------------------------- |
| T1  | S1-S3 | inline | done   | RED: 5 config tests (short, whitespace, equal); GREEN: unit 1783, e2e 564, integration 284, smoke exit 0 |

## Log

- L1 (2026-11-12, user): "vamos con EN-180".
- L2 (2026-11-12, user): scope "Ambos secretos (Recomendado)"; spec question answered "si".
- L3: Risk items 2 (secrets) and 3 (stricter config contract: an existing short `JWT_SECRET` stops the API from starting).
- L4 (2026-11-12): native review (risk, reliability) on a794ac9 approved and acknowledged (lineage review-573fa55a71f7235f); R1-001 registered as EN-182. Fresh review (Opus, worktree, probes P1-P9 all caught): APPROVE. Applied S-1 (exact JWT_SECRET messages), S-2 (test independent of JWT_SECRET), W-1 (EN-182, with S-3). W-2: `apps/api/.env.example` placeholders are shorter than 32 characters; the user updates them (file denied to the agent). W-3: PR #409 filled in.
