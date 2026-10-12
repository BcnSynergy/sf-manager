// Once the Postgres-backed throttler storage is wired (login-rate-limit-
// hardening PR 3), login counters persist in the hermetic database for the
// whole integration run. Specs that call POST /auth/login from the default
// 127.0.0.1 address (e.g. review-schedule.integration.spec.ts) would
// cumulatively reach the default 10-attempt limit and see 429. Raise it for
// every integration spec; login-rate-limit.integration.spec.ts sets its own
// limit explicitly and restores this value afterwards.
// Mirrors apps/api/test/e2e-env.setup.ts.
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '1000';
