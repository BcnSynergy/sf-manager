import * as crypto from 'node:crypto';

// `node:crypto`'s exports are non-configurable, so `jest.spyOn` cannot
// redefine `randomBytes` directly — replace the module with a partial mock
// that wraps the real implementation, keeping every other export intact.
jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof crypto>('node:crypto');
  return { ...actual, randomBytes: jest.fn(actual.randomBytes) };
});

import {
  TEST_DATABASE_PREFIX,
  STALE_RUN_DATABASE_AGE_MS,
  generateRunDatabaseName,
  isRunDatabaseName,
  parseRunDatabaseCreatedAt,
  deriveTestDatabaseUrl,
  toMaintenanceUrl,
  assertTestDatabaseUrl,
  assertWorkerDatabase,
  findDotenvOverride,
  isIntegrationSpecPath,
  planStaleSweep,
  isObjectInUseError,
  isDatabaseMissingError,
  planTeardownDrop,
  stripUtf8Bom,
} from './test-database';

// hermetic-integration-tests design.md Decision 2: run name is
// `sf_manager_test_<8-char base36 timestamp>_<6-char random hex>`, matching
// the exact-shape anchored pattern `isRunDatabaseName` uses.
describe('generateRunDatabaseName / isRunDatabaseName', () => {
  it('generates a name matching isRunDatabaseName', () => {
    const name = generateRunDatabaseName(Date.UTC(2026, 8, 25));
    expect(isRunDatabaseName(name)).toBe(true);
    expect(name.startsWith(TEST_DATABASE_PREFIX)).toBe(true);
  });

  it('stays within the 63-byte Postgres identifier limit', () => {
    const name = generateRunDatabaseName(Date.UTC(2026, 8, 25));
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(63);
  });

  it('produces different names for two calls in the same millisecond (random component)', () => {
    const now = Date.UTC(2026, 8, 25);
    const randomBytesMock = crypto.randomBytes as unknown as jest.Mock;
    randomBytesMock.mockReturnValueOnce(Buffer.from('aaaaaa', 'hex'));
    randomBytesMock.mockReturnValueOnce(Buffer.from('bbbbbb', 'hex'));

    const first = generateRunDatabaseName(now);
    const second = generateRunDatabaseName(now);

    expect(first).not.toBe(second);
    expect(first.endsWith('_aaaaaa')).toBe(true);
    expect(second.endsWith('_bbbbbb')).toBe(true);
  });

  it('rejects the bare dev database name "sfmanager" as not a run name', () => {
    expect(isRunDatabaseName('sfmanager')).toBe(false);
  });

  it('rejects the bare prefix with no suffix', () => {
    expect(isRunDatabaseName('sf_manager_test')).toBe(false);
  });

  it('rejects a lookalike name with the wrong shape after the prefix', () => {
    expect(isRunDatabaseName('sf_manager_test_backup')).toBe(false);
  });

  it('rejects an uppercase name', () => {
    expect(isRunDatabaseName('SF_MANAGER_TEST_MUG72800_9FBC21')).toBe(false);
  });

  it('rejects a name with quotes or a hyphen injected', () => {
    expect(isRunDatabaseName('sf_manager_test_mug72800_9fbc21"; DROP')).toBe(
      false,
    );
    expect(isRunDatabaseName('sf-manager-test-mug72800-9fbc21')).toBe(false);
  });

  it('rejects an unrelated wildcard lookalike name', () => {
    expect(isRunDatabaseName('sfXmanagerXtestXmug72800X9fbc21')).toBe(false);
  });
});

describe('parseRunDatabaseCreatedAt', () => {
  it('round-trips the embedded timestamp for a valid run name', () => {
    const now = Date.UTC(2026, 8, 25);
    const name = generateRunDatabaseName(now);
    expect(parseRunDatabaseCreatedAt(name)).toBe(now);
  });

  it('returns null for a non-run name', () => {
    expect(parseRunDatabaseCreatedAt('sf_manager_test_backup')).toBeNull();
  });

  it('returns null for a timestamp before the plausible-epoch floor (2026-01-01T00:00:00Z)', () => {
    const beforeFloor = Date.UTC(2025, 11, 31);
    const name = generateRunDatabaseName(beforeFloor);
    expect(parseRunDatabaseCreatedAt(name)).toBeNull();
  });

  it('returns null for an unparseable name', () => {
    expect(parseRunDatabaseCreatedAt('not-a-run-name')).toBeNull();
  });
});

describe('deriveTestDatabaseUrl / toMaintenanceUrl / assertTestDatabaseUrl', () => {
  const runName = 'sf_manager_test_mug72800_9fbc21';

  it('swaps only the database name, keeping user, password, host, port and query string', () => {
    const derived = deriveTestDatabaseUrl(
      'postgresql://user:p%40ss@localhost:5432/sfmanager?schema=public',
      runName,
    );
    expect(derived).toBe(
      `postgresql://user:p%40ss@localhost:5432/${runName}?schema=public`,
    );
  });

  it('is idempotent when re-applied to its own output', () => {
    const once = deriveTestDatabaseUrl(
      'postgresql://user:pass@localhost:5432/sfmanager?schema=public',
      runName,
    );
    const twice = deriveTestDatabaseUrl(once, runName);
    expect(twice).toBe(once);
  });

  it('throws when the base URL is missing', () => {
    expect(() => deriveTestDatabaseUrl(undefined, runName)).toThrow();
  });

  it('throws when the base URL is garbage', () => {
    expect(() => deriveTestDatabaseUrl('not a url', runName)).toThrow();
  });

  it('throws when the base URL is a mysql: URL', () => {
    expect(() =>
      deriveTestDatabaseUrl(
        'mysql://user:pass@localhost:3306/sfmanager',
        runName,
      ),
    ).toThrow();
  });

  it('toMaintenanceUrl swaps the database path to /postgres and keeps the query string', () => {
    const maintenance = toMaintenanceUrl(
      `postgresql://user:pass@localhost:5432/${runName}?schema=public`,
    );
    expect(maintenance).toBe(
      'postgresql://user:pass@localhost:5432/postgres?schema=public',
    );
  });

  it('assertTestDatabaseUrl accepts a valid run database URL', () => {
    expect(() =>
      assertTestDatabaseUrl(
        `postgresql://user:pass@localhost:5432/${runName}?schema=public`,
      ),
    ).not.toThrow();
  });

  it('assertTestDatabaseUrl rejects the dev database name "sfmanager"', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://user:pass@localhost:5432/sfmanager'),
    ).toThrow();
  });

  it('assertTestDatabaseUrl rejects the bare "sf_manager_test" name', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://user:pass@localhost:5432/sf_manager_test',
      ),
    ).toThrow();
  });

  it('assertTestDatabaseUrl rejects other, unrelated names', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://user:pass@localhost:5432/other'),
    ).toThrow();
  });

  it('assertTestDatabaseUrl rejects an undefined URL', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow();
  });

  it('assertTestDatabaseUrl never leaks the password in its error message', () => {
    let caught: Error | undefined;
    try {
      assertTestDatabaseUrl(
        'postgresql://user:super-secret@localhost:5432/sfmanager',
      );
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeDefined();
    expect(String(caught?.message)).not.toContain('super-secret');
  });

  it('assertTestDatabaseUrl never leaks an unparseable password in its error message', () => {
    // An unencoded "#" starts a URL fragment and an unencoded "@" inside the
    // password confuses the authority parser, making `new URL()` throw —
    // the redaction path must still never echo the raw password back.
    const unparseable = 'postgresql://user:pa#ss@localhost:5432/sfmanager';
    let caught: Error | undefined;
    try {
      assertTestDatabaseUrl(unparseable);
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeDefined();
    expect(String(caught?.message)).not.toContain('pa#ss');
    expect(String(caught?.message)).not.toContain('ss@');
  });
});

describe('assertWorkerDatabase', () => {
  const runName = 'sf_manager_test_mug72800_9fbc21';
  const runUrl = `postgresql://user:pass@localhost:5432/${runName}?schema=public`;

  it('passes when the derived name equals SF_TEST_RUN_DATABASE and is a valid run name', () => {
    expect(() =>
      assertWorkerDatabase({
        DATABASE_URL: runUrl,
        SF_TEST_RUN_DATABASE: runName,
      }),
    ).not.toThrow();
  });

  it('throws when the names differ even if both are valid sf_manager_test_* names', () => {
    const otherRunName = 'sf_manager_test_mug72801_abcdef';
    expect(() =>
      assertWorkerDatabase({
        DATABASE_URL: runUrl,
        SF_TEST_RUN_DATABASE: otherRunName,
      }),
    ).toThrow();
  });

  it('throws when both channels agree on a name that is not a valid run name (e.g. both sfmanager)', () => {
    expect(() =>
      assertWorkerDatabase({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/sfmanager',
        SF_TEST_RUN_DATABASE: 'sfmanager',
      }),
    ).toThrow();
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      assertWorkerDatabase({ SF_TEST_RUN_DATABASE: runName }),
    ).toThrow();
  });

  it('throws when SF_TEST_RUN_DATABASE is missing', () => {
    expect(() => assertWorkerDatabase({ DATABASE_URL: runUrl })).toThrow();
  });

  it('never leaks the password from a parseable DATABASE_URL in its error message', () => {
    const mismatchedUrl =
      'postgresql://user:super-secret@localhost:5432/sfmanager';
    let caught: Error | undefined;
    try {
      assertWorkerDatabase({
        DATABASE_URL: mismatchedUrl,
        SF_TEST_RUN_DATABASE: runName,
      });
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeDefined();
    expect(String(caught?.message)).not.toContain('super-secret');
  });

  it('never leaks the password from an unparseable DATABASE_URL in its error message', () => {
    const unparseableUrl = 'postgresql://user:pa#ss@localhost:5432/sfmanager';
    let caught: Error | undefined;
    try {
      assertWorkerDatabase({
        DATABASE_URL: unparseableUrl,
        SF_TEST_RUN_DATABASE: runName,
      });
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeDefined();
    expect(String(caught?.message)).not.toContain('pa#ss');
    expect(String(caught?.message)).not.toContain('ss@');
  });
});

describe('findDotenvOverride', () => {
  it('detects the env var with any value, including "false"', () => {
    expect(findDotenvOverride({ DOTENV_CONFIG_OVERRIDE: 'false' }, [])).toBe(
      'DOTENV_CONFIG_OVERRIDE',
    );
    expect(findDotenvOverride({ DOTENV_CONFIG_OVERRIDE: 'true' }, [])).toBe(
      'DOTENV_CONFIG_OVERRIDE',
    );
  });

  it('detects the argv form', () => {
    expect(
      findDotenvOverride({}, [
        'node',
        'script.js',
        'dotenv_config_override=true',
      ]),
    ).toBe('dotenv_config_override=true');
  });

  it('returns null when no override trigger is set', () => {
    expect(findDotenvOverride({}, ['node', 'script.js'])).toBeNull();
  });
});

describe('isIntegrationSpecPath', () => {
  it('recognizes a POSIX-style integration spec path', () => {
    expect(
      isIntegrationSpecPath('src/modules/users/foo.integration.spec.ts'),
    ).toBe(true);
  });

  it('recognizes a Windows-style integration spec path', () => {
    expect(
      isIntegrationSpecPath('src\\modules\\users\\foo.integration.spec.ts'),
    ).toBe(true);
  });

  it('rejects a plain unit spec path', () => {
    expect(isIntegrationSpecPath('src/modules/users/foo.spec.ts')).toBe(false);
  });
});

describe('planStaleSweep', () => {
  const currentRunName = 'sf_manager_test_mug72800_9fbc21';
  const now = Date.UTC(2026, 8, 25);
  const HOUR = 60 * 60 * 1000;

  function nameAgedBy(hours: number): string {
    return generateRunDatabaseName(now - hours * HOUR);
  }

  it('keeps a name aged 23h59m', () => {
    const name = nameAgedBy(23 + 59 / 60);
    expect(planStaleSweep([name], currentRunName, now)).not.toContain(name);
  });

  it('drops a name aged just over 24h', () => {
    const name = nameAgedBy(24 + 1 / 60);
    expect(planStaleSweep([name], currentRunName, now)).toContain(name);
  });

  it('keeps a valid-shape name whose embedded timestamp is below the plausible-epoch floor', () => {
    const name = 'sf_manager_test_00000001_ffffff';
    expect(planStaleSweep([name], currentRunName, now)).not.toContain(name);
  });

  it('keeps a name with a future timestamp', () => {
    const future = generateRunDatabaseName(now + HOUR);
    expect(planStaleSweep([future], currentRunName, now)).not.toContain(future);
  });

  it('excludes the current run name', () => {
    expect(planStaleSweep([currentRunName], currentRunName, now)).not.toContain(
      currentRunName,
    );
  });

  it('never selects lookalike names regardless of age', () => {
    const lookalikes = [
      'sfXmanagerXtestXmug72800X9fbc21',
      'SF_MANAGER_TEST_MUG72800_9FBC21',
      'sf_manager_test_mug72800_9fbc21"',
      'sf-manager-test-mug72800-9fbc21',
      'sf_manager_test_backup',
      'sfmanager',
    ];
    expect(planStaleSweep(lookalikes, currentRunName, now)).toEqual([]);
  });
});

describe('isObjectInUseError / isDatabaseMissingError', () => {
  it('isObjectInUseError recognizes SQLSTATE 55006 and rejects other codes', () => {
    expect(isObjectInUseError({ code: '55006' })).toBe(true);
    expect(isObjectInUseError({ code: '3D000' })).toBe(false);
    expect(isObjectInUseError(new Error('boom'))).toBe(false);
    expect(isObjectInUseError(null)).toBe(false);
  });

  it('isDatabaseMissingError recognizes SQLSTATE 3D000 and rejects other codes', () => {
    expect(isDatabaseMissingError({ code: '3D000' })).toBe(true);
    expect(isDatabaseMissingError({ code: '55006' })).toBe(false);
    expect(isDatabaseMissingError(undefined)).toBe(false);
  });
});

describe('planTeardownDrop', () => {
  it('returns the drop instruction for a valid run name', () => {
    const runName = 'sf_manager_test_mug72800_9fbc21';
    expect(planTeardownDrop(runName)).toEqual({ name: runName });
  });

  it('returns null for a name that fails isRunDatabaseName', () => {
    expect(planTeardownDrop('sfmanager')).toBeNull();
  });
});

describe('stripUtf8Bom', () => {
  it('strips a leading BOM', () => {
    expect(stripUtf8Bom('﻿DATABASE_URL=x')).toBe('DATABASE_URL=x');
  });

  it('leaves BOM-free text unchanged', () => {
    expect(stripUtf8Bom('DATABASE_URL=x')).toBe('DATABASE_URL=x');
  });
});

describe('STALE_RUN_DATABASE_AGE_MS', () => {
  it('is 24 hours in milliseconds', () => {
    expect(STALE_RUN_DATABASE_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });
});
