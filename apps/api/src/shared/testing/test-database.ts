import { randomBytes } from 'node:crypto';

// hermetic-integration-tests design.md Decision 2 / Decision 4: every real-DB
// test run owns a uniquely named database, `sf_manager_test_<8-char base36
// timestamp>_<6-char random hex>`. The timestamp is embedded in the name so
// the stale sweep (`planStaleSweep`) can read a run's age directly from its
// database name, with no side-channel bookkeeping.
export const TEST_DATABASE_PREFIX = 'sf_manager_test_';

// Retention threshold for the stale-database sweep (design.md Decision 4).
export const STALE_RUN_DATABASE_AGE_MS = 24 * 60 * 60 * 1000;

// The anchored, exact-shape pattern is the sole authority on what counts as
// a run database name — never a SQL `LIKE` filter, because `_` is itself a
// SQL wildcard (design.md Decision 4).
const RUN_DATABASE_NAME_PATTERN =
  /^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$/;

// A run name's embedded timestamp before this floor is treated as
// unparseable rather than trusted — guards against a corrupted or
// hand-crafted name being read as a plausible creation time.
const PLAUSIBLE_EPOCH_FLOOR_MS = Date.UTC(2026, 0, 1);

export function generateRunDatabaseName(now: number = Date.now()): string {
  const timestamp = Math.trunc(now).toString(36).padStart(8, '0');
  const random = randomBytes(3).toString('hex');
  return `${TEST_DATABASE_PREFIX}${timestamp}_${random}`;
}

export function isRunDatabaseName(name: string): boolean {
  return RUN_DATABASE_NAME_PATTERN.test(name);
}

export function parseRunDatabaseCreatedAt(name: string): number | null {
  const match = RUN_DATABASE_NAME_PATTERN.exec(name);
  if (!match) {
    return null;
  }
  const timestamp = Number.parseInt(match[1], 36);
  if (!Number.isFinite(timestamp) || timestamp < PLAUSIBLE_EPOCH_FLOOR_MS) {
    return null;
  }
  return timestamp;
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function extractDatabaseName(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) {
    return null;
  }
  const name = parsed.pathname.replace(/^\//, '');
  return name.length > 0 ? name : null;
}

// An unparseable URL (e.g. an unencoded `#`, `/` or space inside the
// password) must never be echoed verbatim into an error message — that
// would leak the raw password. Fall back to a fixed placeholder instead.
function redactPassword(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return '<unparseable URL>';
  }
  if (parsed.password) {
    parsed.password = '***';
  }
  return parsed.toString();
}

export function deriveTestDatabaseUrl(
  baseUrl: string | undefined,
  runName: string,
): string {
  if (!baseUrl) {
    throw new Error('Cannot derive test database URL: base URL is missing.');
  }
  const parsed = parseUrl(baseUrl);
  if (!parsed) {
    throw new Error(
      'Cannot derive test database URL: base URL is not a valid URL.',
    );
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `Cannot derive test database URL: expected a postgres(ql) URL, got "${parsed.protocol}".`,
    );
  }
  parsed.pathname = `/${runName}`;
  return parsed.toString();
}

export function toMaintenanceUrl(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    throw new Error('Cannot derive maintenance URL: URL is not valid.');
  }
  parsed.pathname = '/postgres';
  return parsed.toString();
}

// design.md Decision 3: the guard that keeps a real-DB run away from the dev
// database `sfmanager`. Message redacts the password so it is safe to log.
export function assertTestDatabaseUrl(url: string | undefined): void {
  if (!url) {
    throw new Error(
      'Test database URL is missing; refusing to run against an unknown database.',
    );
  }
  const name = extractDatabaseName(url);
  if (!name || !isRunDatabaseName(name)) {
    throw new Error(
      `Refusing to run against non-test database "${redactPassword(url)}".`,
    );
  }
}

// design.md Decision 1 / Decision 3: checks equality against the published
// run name (SF_TEST_RUN_DATABASE), not pattern-match alone — a worker that
// resolved a sibling run's differently-named but still-valid database must
// still abort.
export function assertWorkerDatabase(env: NodeJS.ProcessEnv): void {
  const databaseUrl = env.DATABASE_URL;
  const runName = env.SF_TEST_RUN_DATABASE;
  const derivedName = databaseUrl ? extractDatabaseName(databaseUrl) : null;

  if (
    !derivedName ||
    !runName ||
    derivedName !== runName ||
    !isRunDatabaseName(derivedName)
  ) {
    const redactedUrl = databaseUrl ? redactPassword(databaseUrl) : 'undefined';
    throw new Error(
      `Refusing to run: worker's DATABASE_URL resolves to "${redactedUrl}", ` +
        `expected run database "${runName ?? 'undefined'}".`,
    );
  }
}

// E1: dotenv reads `override` from `DOTENV_CONFIG_OVERRIDE` (any value,
// including "false", since `Boolean("false")` is `true`) or the argv form
// `dotenv_config_override=`.
export function findDotenvOverride(
  env: NodeJS.ProcessEnv,
  argv: readonly string[],
): string | null {
  if (env.DOTENV_CONFIG_OVERRIDE !== undefined) {
    return 'DOTENV_CONFIG_OVERRIDE';
  }
  const argvOverride = argv.find((arg) =>
    arg.startsWith('dotenv_config_override='),
  );
  return argvOverride ?? null;
}

export function isIntegrationSpecPath(testPath: string): boolean {
  return /\.integration\.spec\.ts$/.test(testPath.replace(/\\/g, '/'));
}

// design.md Decision 4: age-based selection, not connection state — a name
// with a missing or unparseable embedded timestamp is never selected.
export function planStaleSweep(
  existingNames: readonly string[],
  currentRunName: string,
  now: number = Date.now(),
): readonly string[] {
  return existingNames.filter((name) => {
    if (name === currentRunName || !isRunDatabaseName(name)) {
      return false;
    }
    const createdAt = parseRunDatabaseCreatedAt(name);
    if (createdAt === null) {
      return false;
    }
    return now - createdAt > STALE_RUN_DATABASE_AGE_MS;
  });
}

function hasPgErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

// SQLSTATE 55006 (object in use) — secondary safety check only
// (design.md Decision 4).
export function isObjectInUseError(error: unknown): boolean {
  return hasPgErrorCode(error, '55006');
}

// SQLSTATE 3D000 (invalid_catalog_name / database does not exist) — another
// concurrent run's sweep already dropped it first (design.md Decision 4).
export function isDatabaseMissingError(error: unknown): boolean {
  return hasPgErrorCode(error, '3D000');
}

export function planTeardownDrop(runName: string): { name: string } | null {
  return isRunDatabaseName(runName) ? { name: runName } : null;
}

export function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
