import {
  assertTestDatabaseUrl,
  deriveTestDatabaseUrl,
  findDotenvOverride,
  generateRunDatabaseName,
  isDatabaseMissingError,
  isObjectInUseError,
  isRunDatabaseName,
  planStaleSweep,
  toMaintenanceUrl,
} from './test-database';

// hermetic-integration-tests design.md Interfaces/Contracts: injected ports
// so the sweep-create-migrate orchestration below is unit-testable with
// recording fakes, no real Postgres connection required.
export interface TestDatabasePorts {
  baseUrl: string | undefined;
  argv: readonly string[];
  env: Readonly<NodeJS.ProcessEnv>;
  now?: () => number;
  // All `pg_database.datname` where `NOT datistemplate` — never a SQL LIKE
  // filter; filtering to run databases happens in JS via isRunDatabaseName.
  listDatabases(maintenanceUrl: string): Promise<string[]>;
  // Rejects with the raw pg error (carrying `code`) on failure; does no
  // classification of its own.
  dropDatabase(
    maintenanceUrl: string,
    name: string,
    options?: { force?: boolean },
  ): Promise<void>;
  // Always a separate call from dropDatabase — never combined in one
  // statement (Postgres rejects CREATE/DROP DATABASE inside a transaction
  // block that a multi-statement string would implicitly open).
  createDatabase(maintenanceUrl: string, name: string): Promise<void>;
  migrate(testUrl: string): void;
}

// design.md Decision 3 / Decision 4: guard-first, then list → sweep by age
// → create → migrate → publish. Does not mutate process.env — the thin,
// untested global-setup.ts glue does that from this function's return value.
export async function prepareTestDatabase(
  ports: TestDatabasePorts,
): Promise<{ runName: string; testUrl: string }> {
  const overrideTrigger = findDotenvOverride(ports.env, ports.argv);
  if (overrideTrigger) {
    throw new Error(
      `Refusing to prepare a test database: dotenv override trigger "${overrideTrigger}" is set.`,
    );
  }

  const now = ports.now ? ports.now() : Date.now();
  const runName = generateRunDatabaseName(now);
  const testUrl = deriveTestDatabaseUrl(ports.baseUrl, runName);
  // Guards the generated-name shape (e.g. a malformed timestamp from an
  // out-of-range `now`) before any port call.
  assertTestDatabaseUrl(testUrl);

  const maintenanceUrl = toMaintenanceUrl(testUrl);

  const existingNames = await ports.listDatabases(maintenanceUrl);
  const runNames = existingNames.filter(isRunDatabaseName);
  const staleNames = planStaleSweep(runNames, runName, now);

  for (const staleName of staleNames) {
    try {
      await ports.dropDatabase(maintenanceUrl, staleName);
    } catch (error) {
      if (isObjectInUseError(error) || isDatabaseMissingError(error)) {
        continue;
      }
      throw error;
    }
  }

  // On failure (e.g. SQLSTATE 42P04, duplicate_database), rethrow without
  // calling dropDatabase — that name may belong to another run.
  await ports.createDatabase(maintenanceUrl, runName);

  try {
    ports.migrate(testUrl);
  } catch (migrateError) {
    try {
      await ports.dropDatabase(maintenanceUrl, runName, { force: true });
    } catch (dropError) {
      const combined = new Error(
        `Migration failed for run database "${runName}", and the ` +
          `subsequent cleanup drop also failed: ${(dropError as Error).message}`,
        { cause: migrateError },
      );
      (combined as Error & { dropError?: unknown }).dropError = dropError;
      throw combined;
    }
    throw migrateError;
  }

  return { runName, testUrl };
}
