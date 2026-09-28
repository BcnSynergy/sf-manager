import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  prepareTestDatabase,
  TestDatabasePorts,
} from '../../src/shared/testing/prepare-test-database';
import { redactMigrateOutput } from '../../src/shared/testing/test-database';
import { readBaseDatabaseUrl } from './read-base-database-url';

const API_ROOT = resolve(__dirname, '../..');

async function withMaintenanceClient<T>(
  maintenanceUrl: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const ports: TestDatabasePorts = {
  baseUrl: readBaseDatabaseUrl(),
  argv: process.argv,
  env: process.env,
  async listDatabases(maintenanceUrl) {
    return withMaintenanceClient(maintenanceUrl, async (client) => {
      const result = await client.query<{ datname: string }>(
        'SELECT datname FROM pg_database WHERE NOT datistemplate',
      );
      return result.rows.map((row) => row.datname);
    });
  },
  async dropDatabase(maintenanceUrl, name, options) {
    await withMaintenanceClient(maintenanceUrl, async (client) => {
      const force = options?.force ? ' WITH (FORCE)' : '';
      await client.query(`DROP DATABASE "${name}"${force}`);
    });
  },
  async createDatabase(maintenanceUrl, name) {
    await withMaintenanceClient(maintenanceUrl, async (client) => {
      await client.query(`CREATE DATABASE "${name}"`);
    });
  },
  migrate(testUrl) {
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: API_ROOT,
        env: { ...process.env, DATABASE_URL: testUrl },
        encoding: 'utf8',
      },
    );
    if (result.status !== 0) {
      const output = `${result.stderr || ''}${result.stdout || ''}`;
      throw new Error(
        `prisma migrate deploy failed (exit ${
          result.status ?? `signal ${result.signal}`
        }): ${redactMigrateOutput(output, testUrl)}`,
      );
    }
  },
};

// hermetic-integration-tests design.md Data Flow: wires `pg` and
// `spawnSync` into the pure `prepareTestDatabase` orchestration, then
// publishes the result through both channels (`DATABASE_URL`,
// `SF_TEST_RUN_DATABASE`) plus the same-process `globalThis` handoff read by
// global-teardown.ts. Thin glue, untested — the orchestration and every
// guard it calls are unit-tested in src/shared/testing.
export default async function globalSetup(): Promise<void> {
  const { runName, testUrl } = await prepareTestDatabase(ports);
  process.env.DATABASE_URL = testUrl;
  process.env.SF_TEST_RUN_DATABASE = runName;
  (
    globalThis as typeof globalThis & { __SF_TEST_RUN_DATABASE__?: string }
  ).__SF_TEST_RUN_DATABASE__ = runName;
}
