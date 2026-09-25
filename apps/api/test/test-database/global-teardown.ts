import { Client } from 'pg';
import {
  deriveTestDatabaseUrl,
  planTeardownDrop,
  toMaintenanceUrl,
} from '../../src/shared/testing/test-database';
import { readBaseDatabaseUrl } from './read-base-database-url';

// hermetic-integration-tests design.md Decision 12: reads the run name from
// `globalThis` (set by global-setup.ts in the same parent process), not
// re-parsed from `process.env` or the URL, and verifies it with the pure
// `planTeardownDrop` before issuing any DROP. Thin glue, untested — the drop
// decision itself is unit-tested in src/shared/testing.
export default async function globalTeardown(): Promise<void> {
  const runName = (
    globalThis as typeof globalThis & { __SF_TEST_RUN_DATABASE__?: string }
  ).__SF_TEST_RUN_DATABASE__;

  if (!runName) {
    throw new Error(
      'Cannot tear down the test database: no run database name was ' +
        'recorded by global setup.',
    );
  }

  const plan = planTeardownDrop(runName);
  if (!plan) {
    throw new Error(
      `Refusing to drop database "${runName}": it does not pass the ` +
        'run-database name check.',
    );
  }

  const runUrl = deriveTestDatabaseUrl(readBaseDatabaseUrl(), plan.name);
  const maintenanceUrl = toMaintenanceUrl(runUrl);

  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE "${plan.name}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}
