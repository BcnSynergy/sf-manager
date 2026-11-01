# TD-5 refresh-token rotation

Locator: `odd/tasks/td-5-refresh-token-rotation.md` (Engram mirror: `odd/td-5-refresh-token-rotation/tasks`).
Objective: implement ADR-011 Decision 4 in full — a short-lived access token plus a rotating refresh token with reuse detection, renewed silently by the web client — and resolve TD-5. Delivery `stacked-to-main`, three PRs, branches `td-5-refresh-token-rotation/<NN>-<slug>`; forecast about 1,400 authored lines, most of it tests. Test runners: Jest in `apps/api` (`npm test`, `npm run test:integration`, `npm run test:e2e`), Vitest in `apps/web` (`npm run test --workspace=apps/web`).

## Specs

- S1 (L1, L2): "vamos con TD-5", option "Decision 4 completa". ADR-011 Decision 4: "JWT access token (short-lived, ~15 min) + rotating refresh token". Access tokens last 15 minutes by default (`JWT_EXPIRES_IN`), switched only when the web renews silently (T3), so no release logs users out every 15 minutes.
- S2 (L2, ADR-011 Decision 4): "Refresh tokens: httpOnly + Secure + SameSite cookie for the web client". The refresh token is an opaque random value; only its hash is stored. Its cookie is httpOnly, Secure in production, SameSite like the access cookie, and scoped to the refresh path, configurable because the browser-visible path differs between dev (`/auth/refresh`) and prod (`/api/auth/refresh`).
- S3 (L2): every successful `POST /auth/refresh` rotates: the presented refresh token is consumed, a new refresh token and a new access token are issued in the same family.
- S4 (L2): reuse detection. Presenting a refresh token that was already rotated, outside a short grace window, revokes the whole family and answers 401. Inside the grace window (assumption: about 10 seconds, so two tabs refreshing at once are not taken for theft) it is treated as a concurrent refresh and does not revoke.
- S5 (L3): "8 h inactiv. / 7 d máx.". A family not refreshed for 8 hours expires (idle timeout); a family expires 7 days after its login whatever the activity (absolute maximum). Both configurable by env, with these defaults.
- S6 (assumption): logout revokes the current refresh family and clears both cookies; it works with only a refresh cookie (access cookie already expired). Deleting a user or the live user check failing also makes refresh fail (401).
- S7 (assumption): `POST /auth/refresh` is `@Public()`, rejects requests whose `Origin` is present and is not `CORS_ORIGIN` (CSRF), and is rate-limited separately from login.
- S8 (assumption): web: on a 401 from an authenticated call, `apiFetch` performs one single-flight refresh per tab and retries the original request once; only a failed refresh ends the session (session-ended notice). Mount-time restore also tries a refresh before declaring the user logged out.
- S9: `openspec/specs/authentication/spec.md` and the session-cookie scenario in `openspec/specs/deployment/spec.md` are edited in the PR that changes the behavior; ADR-011 gets an addendum closing the 2026-08-21 deviation 2; README, `.env.example`, `prod.env.example` and `docker-compose.prod.yml` document the new variables; TD-5 moves to Resolved in the last PR.

## Tasks

| ID  | Specs              | Scope                                                                                                                                                                                                           | Branch                                               | Route  | Status  | Commit |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ | ------- | ------ |
| T1  | S2–S5              | API: `RefreshToken` Prisma model + migration; `RefreshTokenStore` port + Prisma adapter (integration-tested); `RefreshSessionUseCase` (rotation, reuse detection, grace, idle and absolute expiry); config      | `td-5-refresh-token-rotation/01-refresh-token-store` | inline | pending |        |
| T2  | S2, S3, S6, S7, S9 | API: login sets the refresh cookie; `POST /auth/refresh`; logout revokes the family and clears both cookies; shared e2e fake for the 13 suites; authentication spec (API); ADR-011 addendum; env docs           | `td-5-refresh-token-rotation/02-refresh-endpoint`    | inline | pending |        |
| T3  | S1, S8, S9         | Web: single-flight refresh and retry in `apiFetch`; mount-time restore; session ends only after a failed refresh; access default to 15m; authentication (web) and deployment specs; TD-5 resolved; browser pass | `td-5-refresh-token-rotation/03-web-silent-refresh`  | inline | pending |        |

Route evidence: sequential, dependent PRs written inline by the parent; no writer trigger (units depend on each other). Every task touches risk item 2 (auth); T1 also item 1 (new table, migration). Each PR gets an independent fresh-context review before push and before merge (CLAUDE.md).

## Log

- L1 (2026-11-01): "vamos con TD-5"
- L2 (2026-11-01): chose "Decision 4 completa" over a simple sliding session or closing TD-5 by decision.
- L3 (2026-11-01): session lifetime "8 h inactiv. / 7 d máx." (idle 8 h, absolute 7 days).
- L4 (2026-11-01): map from a read-only explorer: cookie `sf_access_token` path `/`, SameSite strict only in production (`auth.config.ts:70-77`); Caddy strips `/api`; 13 e2e suites each copy an `InMemoryTokenDenylist` and stub `PrismaService`; no scheduled cleanup (opportunistic `deleteExpired` on login/logout); refresh hook goes in `apiFetch`'s 401 branch (`client.ts:100`) and `AuthProvider.tsx:47`. Technical choices taken by the parent: single-flight per tab plus grace window, configurable refresh cookie path, Origin check, shared e2e fake.
- Next: T1.
