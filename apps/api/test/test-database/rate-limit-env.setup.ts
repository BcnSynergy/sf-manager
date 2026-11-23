import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// EN-222: test apps never use the dev upload directory (apps/api/storage,
// the default outside production). Booting AppModule also starts the orphan
// review photo file sweep, which would delete dev photo files that the test
// database has no rows for if an app stayed up long enough.
process.env.FILE_STORAGE_DIR = join(tmpdir(), 'sf-manager-test-files');
mkdirSync(process.env.FILE_STORAGE_DIR, { recursive: true });

// Once the Postgres-backed throttler storage is wired (login-rate-limit-
// hardening PR 3), login counters persist in the hermetic database for the
// whole integration run. Specs that call POST /auth/login from the default
// 127.0.0.1 address (e.g. review-schedule.integration.spec.ts) would
// cumulatively reach the default 10-attempt limit and see 429. Raise it for
// every integration spec; login-rate-limit.integration.spec.ts sets its own
// limit explicitly and restores this value afterwards.
// Mirrors apps/api/test/e2e-env.setup.ts.
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '1000';
// Suites that fail a login repeatedly with one email (wrong-password cases)
// would trip the per-email failure limit (default 5). Raise it for every
// suite; login-email-limit.*-spec.ts set and restore low values explicitly.
process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = '1000';
