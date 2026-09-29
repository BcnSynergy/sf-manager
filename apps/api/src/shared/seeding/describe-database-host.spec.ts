import { describeDatabaseHost } from './describe-database-host';

// dev-seed-data design.md Decision 3: the seed logs WHERE it runs so an
// operator can spot a wrong target, but never the credentials in the URL.
describe('describeDatabaseHost', () => {
  it('returns host and port for a standard Postgres URL', () => {
    expect(
      describeDatabaseHost(
        'postgresql://sfmanager:sfmanager@localhost:5432/sfmanager?schema=public',
      ),
    ).toBe('localhost:5432');
  });

  it('never includes the user or the password', () => {
    const host = describeDatabaseHost(
      'postgresql://admin:s3cr3tpass@db.internal.example:6543/prod',
    );

    expect(host).toBe('db.internal.example:6543');
    expect(host).not.toContain('admin');
    expect(host).not.toContain('s3cr3tpass');
  });

  it('returns the bare host when the URL has no port', () => {
    expect(describeDatabaseHost('postgresql://u:p@db.example/app')).toBe(
      'db.example',
    );
  });

  it('returns "unknown" when the URL is unset', () => {
    expect(describeDatabaseHost(undefined)).toBe('unknown');
  });

  it.each([
    ['not a URL', 'not a url'],
    ['an empty string', ''],
    ['a URL without a host', 'postgresql:///sfmanager'],
  ])('returns "unknown" without throwing for %s', (_label, value) => {
    expect(describeDatabaseHost(value)).toBe('unknown');
  });
});
