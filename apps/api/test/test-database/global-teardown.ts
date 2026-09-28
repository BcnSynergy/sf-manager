import { Client } from 'pg';
import {
  planTeardownDrop,
  toMaintenanceUrl,
} from '../../src/shared/testing/test-database';

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

  // global-setup.ts already overwrote process.env.DATABASE_URL with the run
  // database's own URL in this same parent process (Jest runs globalSetup
  // and globalTeardown in the parent, never in a worker), so it is reused
  // directly here rather than re-derived from `readBaseDatabaseUrl()` — by
  // teardown time that helper no longer returns the "base" URL at all, only
  // the (already-derived) run URL, making a second `deriveTestDatabaseUrl`
  // call a misleading no-op. `toMaintenanceUrl()` only needs this URL's
  // host/port/credentials; the database actually dropped below is always
  // `plan.name`, never whatever path this URL carries.
  const runUrl = process.env.DATABASE_URL;
  if (!runUrl) {
    throw new Error(
      `Cannot tear down database "${plan.name}": DATABASE_URL is not set ` +
        'in this process.',
    );
  }
  const maintenanceUrl = toMaintenanceUrl(runUrl);

  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE "${plan.name}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}
