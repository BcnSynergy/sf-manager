import { InMemoryUserDirectory } from './in-memory-user-directory';

// review-history-company-scope/design.md Decision 5/8, tasks.md 3.4: the
// read-path half of the fake — one call resolves the whole batch, a
// soft-deleted performer's email still resolves (the fake has no
// deletedAt concept at all, mirroring the Prisma adapter's deliberate
// bypass), and an unresolvable id is simply absent from the map so
// callers fall back to `''`.
describe('InMemoryUserDirectory.findEmailsByIds', () => {
  it('resolves every seeded id in one call, regardless of row count', async () => {
    const directory = new InMemoryUserDirectory();
    directory.seedEmail('user-1', 'user-1@example.com');
    directory.seedEmail('user-2', 'user-2@example.com');
    directory.seedEmail('user-3', 'user-3@example.com');

    const result = await directory.findEmailsByIds([
      'user-1',
      'user-2',
      'user-3',
    ]);

    expect(result).toEqual(
      new Map([
        ['user-1', 'user-1@example.com'],
        ['user-2', 'user-2@example.com'],
        ['user-3', 'user-3@example.com'],
      ]),
    );
  });

  it("a soft-deleted performer's email still resolves", async () => {
    const directory = new InMemoryUserDirectory();
    directory.seedEmail('departed-user', 'departed@example.com');

    const result = await directory.findEmailsByIds(['departed-user']);

    expect(result.get('departed-user')).toBe('departed@example.com');
  });

  it('an unresolvable id is absent from the map, not an error', async () => {
    const directory = new InMemoryUserDirectory();
    directory.seedEmail('user-1', 'user-1@example.com');

    const result = await directory.findEmailsByIds(['user-1', 'unknown-id']);

    expect(result.get('unknown-id') ?? '').toBe('');
    expect(result.has('unknown-id')).toBe(false);
  });

  it('an empty id list resolves to an empty map', async () => {
    const directory = new InMemoryUserDirectory();

    const result = await directory.findEmailsByIds([]);

    expect(result.size).toBe(0);
  });
});
