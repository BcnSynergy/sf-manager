import {
  prepareTestDatabase,
  TestDatabasePorts,
} from './prepare-test-database';
import { generateRunDatabaseName, isRunDatabaseName } from './test-database';

const FIXED_NOW = Date.UTC(2026, 8, 25);
const HOUR_MS = 60 * 60 * 1000;

// A run name generated 25h before FIXED_NOW — always stale under the 24h
// retention threshold, regardless of the exact base36 encoding.
function staleRunName(): string {
  return generateRunDatabaseName(FIXED_NOW - 25 * HOUR_MS);
}

// hermetic-integration-tests design.md Decision 3 / Decision 4: recording
// fakes for the injected `TestDatabasePorts`, so the sweep-create-migrate
// orchestration is exercised without a real Postgres connection.
function createFakePorts(
  overrides: Partial<TestDatabasePorts> = {},
): TestDatabasePorts & { calls: string[] } {
  const calls: string[] = [];
  const ports: TestDatabasePorts & { calls: string[] } = {
    baseUrl: 'postgresql://user:pass@localhost:5432/sfmanager?schema=public',
    argv: ['node', 'jest'],
    env: {},
    now: () => FIXED_NOW,
    calls,
    listDatabases: jest.fn((maintenanceUrl: string) => {
      calls.push(`listDatabases(${maintenanceUrl})`);
      return Promise.resolve([]);
    }),
    dropDatabase: jest.fn(
      (maintenanceUrl: string, name: string, options?: { force?: boolean }) => {
        calls.push(`dropDatabase(${name},force=${!!options?.force})`);
        return Promise.resolve();
      },
    ),
    createDatabase: jest.fn((maintenanceUrl: string, name: string) => {
      calls.push(`createDatabase(${name})`);
      return Promise.resolve();
    }),
    migrate: jest.fn((testUrl: string) => {
      calls.push(`migrate(${testUrl})`);
    }),
    ...overrides,
  };
  return ports;
}

describe('prepareTestDatabase — guard-first ordering', () => {
  it('does not call any port when a dotenv override trigger is set', async () => {
    const ports = createFakePorts({
      env: { DOTENV_CONFIG_OVERRIDE: 'false' },
    });

    await expect(prepareTestDatabase(ports)).rejects.toThrow();

    expect(ports.listDatabases).not.toHaveBeenCalled();
    expect(ports.dropDatabase).not.toHaveBeenCalled();
    expect(ports.createDatabase).not.toHaveBeenCalled();
    expect(ports.migrate).not.toHaveBeenCalled();
  });

  it('does not call any port when the generated run name is malformed', async () => {
    // A `now` value above 36^8 ms makes generateRunDatabaseName emit a
    // 9-character timestamp instead of 8, failing the generated-name-shape
    // guard (assertTestDatabaseUrl) before any port call.
    const malformedNow = Math.pow(36, 8) + 1;
    const ports = createFakePorts({ now: () => malformedNow });

    await expect(prepareTestDatabase(ports)).rejects.toThrow();

    expect(ports.listDatabases).not.toHaveBeenCalled();
    expect(ports.dropDatabase).not.toHaveBeenCalled();
    expect(ports.createDatabase).not.toHaveBeenCalled();
    expect(ports.migrate).not.toHaveBeenCalled();
  });
});

describe('prepareTestDatabase — sweep classification', () => {
  it('skips a stale drop rejected with SQLSTATE 55006 (object in use) and continues', async () => {
    const staleName = staleRunName();
    const ports = createFakePorts({
      listDatabases: jest.fn(() => Promise.resolve(['sfmanager', staleName])),
      dropDatabase: jest.fn(() => {
        const error: Error & { code?: string } = new Error('in use');
        error.code = '55006';
        return Promise.reject(error);
      }),
    });

    const result = await prepareTestDatabase(ports);

    expect(isRunDatabaseName(result.runName)).toBe(true);
    expect(ports.dropDatabase).toHaveBeenCalledTimes(1);
    expect(ports.createDatabase).toHaveBeenCalledTimes(1);
    expect(ports.migrate).toHaveBeenCalledTimes(1);
  });

  it('skips a stale drop rejected with SQLSTATE 3D000 (already gone) and continues to create', async () => {
    const staleName = staleRunName();
    const ports = createFakePorts({
      listDatabases: jest.fn(() => Promise.resolve([staleName])),
      dropDatabase: jest.fn(() => {
        const error: Error & { code?: string } = new Error('does not exist');
        error.code = '3D000';
        return Promise.reject(error);
      }),
    });

    const result = await prepareTestDatabase(ports);

    expect(ports.dropDatabase).toHaveBeenCalledTimes(1);
    expect(ports.createDatabase).toHaveBeenCalledWith(
      expect.any(String),
      result.runName,
    );
  });

  it('rethrows any other drop error', async () => {
    const staleName = staleRunName();
    const ports = createFakePorts({
      listDatabases: jest.fn(() => Promise.resolve([staleName])),
      dropDatabase: jest.fn(() => Promise.reject(new Error('disk full'))),
    });

    await expect(prepareTestDatabase(ports)).rejects.toThrow('disk full');
    expect(ports.createDatabase).not.toHaveBeenCalled();
  });
});

describe('prepareTestDatabase — happy path', () => {
  it('lists, sweeps, creates and migrates, returning runName and testUrl', async () => {
    const ports = createFakePorts();

    const result = await prepareTestDatabase(ports);

    expect(isRunDatabaseName(result.runName)).toBe(true);
    expect(result.testUrl).toContain(result.runName);
    expect(ports.listDatabases).toHaveBeenCalledTimes(1);
    expect(ports.createDatabase).toHaveBeenCalledWith(
      expect.any(String),
      result.runName,
    );
    expect(ports.migrate).toHaveBeenCalledWith(result.testUrl);
    expect(ports.dropDatabase).not.toHaveBeenCalled();
  });

  it('does not mutate process.env', async () => {
    const before = { ...process.env };
    const ports = createFakePorts();

    await prepareTestDatabase(ports);

    expect(process.env).toEqual(before);
  });
});

describe('prepareTestDatabase — create failure (SQLSTATE 42P04)', () => {
  it('rethrows without calling dropDatabase, since the name may belong to another run', async () => {
    const ports = createFakePorts({
      createDatabase: jest.fn(() => {
        const error: Error & { code?: string } = new Error('duplicate');
        error.code = '42P04';
        return Promise.reject(error);
      }),
    });

    await expect(prepareTestDatabase(ports)).rejects.toThrow('duplicate');
    expect(ports.dropDatabase).not.toHaveBeenCalled();
  });
});

describe('prepareTestDatabase — migrate failure', () => {
  it('drops its own run database (force) then rethrows the original migrate error', async () => {
    const migrateError = new Error('migration failed');
    const ports = createFakePorts({
      migrate: jest.fn(() => {
        throw migrateError;
      }),
    });

    await expect(prepareTestDatabase(ports)).rejects.toThrow(
      'migration failed',
    );
    expect(ports.dropDatabase).toHaveBeenCalledTimes(1);
    const [, droppedName, options] = (ports.dropDatabase as jest.Mock).mock
      .calls[0] as [string, string, { force?: boolean } | undefined];
    expect(isRunDatabaseName(droppedName)).toBe(true);
    expect(options).toEqual({ force: true });
  });

  it('surfaces the drop failure too when the cleanup drop itself also fails', async () => {
    const migrateError = new Error('migration failed');
    const dropError = new Error('drop also failed');
    const ports = createFakePorts({
      migrate: jest.fn(() => {
        throw migrateError;
      }),
      dropDatabase: jest.fn(() => Promise.reject(dropError)),
    });

    try {
      await prepareTestDatabase(ports);
      fail('expected prepareTestDatabase to reject');
    } catch (error) {
      const message = String((error as Error).message);
      expect(message.toLowerCase()).toContain('migration failed');
      expect(
        (error as Error).cause ??
          (error as Error & { dropError?: unknown }).dropError,
      ).toBeDefined();
    }
  });
});
