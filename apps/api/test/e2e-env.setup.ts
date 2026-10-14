// The e2e suites log in once per user (some seed a dozen users) inside a
// single app, which would exhaust the default 10-attempt login limit.
// Raise it for every suite; login-rate-limit.e2e-spec.ts deletes this
// variable on purpose to exercise the real defaults.
process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '1000';
// Suites that fail a login repeatedly with one email (wrong-password cases)
// would trip the per-email failure limit (default 5). Raise it for every
// suite; login-email-limit.*-spec.ts set and restore low values explicitly.
process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = '1000';
