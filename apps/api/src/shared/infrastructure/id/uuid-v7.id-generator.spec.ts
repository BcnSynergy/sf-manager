import { UuidV7IdGenerator } from './uuid-v7.id-generator';

// UUIDv7 per ADR-009 / design.md Decision 3: the `uuid` package's `v7()`,
// wrapped behind the `IdGenerator` port so every entity reuses this adapter.
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('UuidV7IdGenerator', () => {
  const generator = new UuidV7IdGenerator();

  it('generates an id matching the UUIDv7 format (version 7, RFC 4122 variant)', () => {
    const id = generator.generate();

    expect(id).toMatch(UUID_V7_PATTERN);
  });

  it('generates monotonically ordered ids across successive calls', () => {
    const ids = Array.from({ length: 5 }, () => generator.generate());
    const sorted = [...ids].sort();

    expect(ids).toEqual(sorted);
  });
});
