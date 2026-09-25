import {
  prepareTestDatabase,
  TestDatabasePorts,
} from './prepare-test-database';
import {
  generateRunDatabaseName,
  isRunDatabaseName,
  parseRunDatabaseCreatedAt,
} from './test-database';

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
// `existingNames` seeds the default `listDatabases` fake so call-order
// recording (`calls`) stays intact even when a test needs a non-empty
// database list — overriding `listDatabases` entirely would silently drop
// that recording.
function createFakePorts(
  overrides: Partial<TestDatabasePorts> = {},
  existingNames: readonly string[] = [],
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
      return Promise.resolve([...existingNames]);
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
    const ports = createFakePorts(
      {
        dropDatabase: jest.fn(() => {
          const error: Error & { code?: string } = new Error('in use');
          error.code = '55006';
          return Promise.reject(error);
        }),
      },
      ['sfmanager', staleName],
    );

    const result = await prepareTestDatabase(ports);

    expect(isRunDatabaseName(result.runName)).toBe(true);
    expect(ports.dropDatabase).toHaveBeenCalledTimes(1);
    expect(ports.createDatabase).toHaveBeenCalledTimes(1);
    expect(ports.migrate).toHaveBeenCalledTimes(1);
  });

  it('skips a stale drop rejected with SQLSTATE 3D000 (already gone) and continues to create', async () => {
    const staleName = staleRunName();
    const ports = createFakePorts(
      {
        dropDatabase: jest.fn(() => {
          const error: Error & { code?: string } = new Error('does not exist');
          error.code = '3D000';
          return Promise.reject(error);
        }),
      },
      [staleName],
    );

    const result = await prepareTestDatabase(ports);

    expect(ports.dropDatabase).toHaveBeenCalledTimes(1);
    expect(ports.createDatabase).toHaveBeenCalledWith(
      expect.any(String),
      result.runName,
    );
  });

  it('rethrows any other drop error', async () => {
    const staleName = staleRunName();
    const ports = createFakePorts(
      { dropDatabase: jest.fn(() => Promise.reject(new Error('disk full'))) },
      [staleName],
    );

    await expect(prepareTestDatabase(ports)).rejects.toThrow('disk full');
    expect(ports.createDatabase).not.toHaveBeenCalled();
  });

  it('continues sweeping subsequent stale names after a drop is skipped (SQLSTATE 55006)', async () => {
    const staleA = generateRunDatabaseName(FIXED_NOW - 25 * HOUR_MS);
    const staleB = generateRunDatabaseName(FIXED_NOW - 26 * HOUR_MS);
    const ports = createFakePorts({}, [staleA, staleB]);
    (ports.dropDatabase as jest.Mock).mockImplementation(
      (maintenanceUrl: string, name: string, options?: { force?: boolean }) => {
        ports.calls.push(`dropDatabase(${name},force=${!!options?.force})`);
        if (name === staleA) {
          const error: Error & { code?: string } = new Error('in use');
          error.code = '55006';
          return Promise.reject(error);
        }
        return Promise.resolve();
      },
    );

    const result = await prepareTestDatabase(ports);

    expect(ports.dropDatabase).toHaveBeenCalledTimes(2);
    expect(ports.dropDatabase).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      staleB,
    );
    expect(ports.createDatabase).toHaveBeenCalledTimes(1);
    expect(ports.migrate).toHaveBeenCalledTimes(1);
    expect(isRunDatabaseName(result.runName)).toBe(true);
  });

  it('continues sweeping subsequent stale names after a drop is skipped (SQLSTATE 3D000)', async () => {
    const staleA = generateRunDatabaseName(FIXED_NOW - 25 * HOUR_MS);
    const staleB = generateRunDatabaseName(FIXED_NOW - 26 * HOUR_MS);
    const ports = createFakePorts({}, [staleA, staleB]);
    (ports.dropDatabase as jest.Mock).mockImplementation(
      (maintenanceUrl: string, name: string, options?: { force?: boolean }) => {
        ports.calls.push(`dropDatabase(${name},force=${!!options?.force})`);
        if (name === staleA) {
          const error: Error & { code?: string } = new Error('does not exist');
          error.code = '3D000';
          return Promise.reject(error);
        }
        return Promise.resolve();
      },
    );

    const result = await prepareTestDatabase(ports);

    expect(ports.dropDatabase).toHaveBeenCalledTimes(2);
    expect(ports.dropDatabase).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      staleB,
    );
    expect(ports.createDatabase).toHaveBeenCalledTimes(1);
    expect(ports.migrate).toHaveBeenCalledTimes(1);
    expect(isRunDatabaseName(result.runName)).toBe(true);
  });
});

describe('prepareTestDatabase — uses the same injected `now` for the run name and the sweep', () => {
  it('does not drop a run database aged 23h under the injected now, and stamps that same now into the new run name', async () => {
    const freshName = generateRunDatabaseName(FIXED_NOW - 23 * HOUR_MS);
    const ports = createFakePorts({}, [freshName]);

    const result = await prepareTestDatabase(ports);

    expect(ports.dropDatabase).not.toHaveBeenCalled();
    expect(parseRunDatabaseCreatedAt(result.runName)).toBe(FIXED_NOW);
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

  it('records the full call order: listDatabases -> dropDatabase(stale) -> createDatabase -> migrate', async () => {
    const staleName = staleRunName();
    const ports = createFakePorts({}, [staleName]);

    const result = await prepareTestDatabase(ports);

    expect(ports.calls).toHaveLength(4);
    expect(ports.calls[0]).toMatch(/^listDatabases\(/);
    expect(ports.calls[1]).toBe(`dropDatabase(${staleName},force=false)`);
    expect(ports.calls[2]).toBe(`createDatabase(${result.runName})`);
    expect(ports.calls[3]).toBe(`migrate(${result.testUrl})`);
  });
});

describe('prepareTestDatabase — create failure (SQLSTATE 42P04)', () => {
  it('rethrows without calling dropDatabase or migrate; createDatabase is the last port call', async () => {
    const ports = createFakePorts();
    (ports.createDatabase as jest.Mock).mockImplementation(
      (maintenanceUrl: string, name: string) => {
        ports.calls.push(`createDatabase(${name})`);
        const error: Error & { code?: string } = new Error('duplicate');
        error.code = '42P04';
        return Promise.reject(error);
      },
    );

    await expect(prepareTestDatabase(ports)).rejects.toThrow('duplicate');

    expect(ports.dropDatabase).not.toHaveBeenCalled();
    expect(ports.migrate).not.toHaveBeenCalled();
    expect(ports.calls[ports.calls.length - 1]).toMatch(/^createDatabase\(/);
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
