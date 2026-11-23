import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// EN-222: test apps never use the dev upload directory (apps/api/storage,
// the default outside production). Booting AppModule also starts the orphan
// review photo file sweep, which would delete dev photo files that the test
// database has no rows for if an app stayed up long enough.
process.env.FILE_STORAGE_DIR = join(tmpdir(), 'sf-manager-test-files');
mkdirSync(process.env.FILE_STORAGE_DIR, { recursive: true });

// The e2e suites log in once per user (some seed a dozen users) inside a
// single app, which would exhaust the default 10-attempt login limit.
// Raise it for every suite; login-rate-limit.e2e-spec.ts deletes this
// variable on purpose to exercise the real defaults.
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '1000';
// Suites that fail a login repeatedly with one email (wrong-password cases)
// would trip the per-email failure limit (default 5). Raise it for every
// suite; login-email-limit.*-spec.ts set and restore low values explicitly.
process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = '1000';
process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS = '1000';
// Suites that request or confirm resets repeatedly from one client would trip
// the password-reset limit (10 per client key); the
// password-reset-rate-limit suite sets low values explicitly.
process.env.PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS = '1000';
