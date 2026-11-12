import { MIN_SECRET_LENGTH, readSecret } from './secret.config';

// EN-180: a secret that is short, padded with whitespace or missing stops
// startup, and no error message ever echoes the secret's value.
describe('readSecret', () => {
  const originalEnv = process.env;
  const VALID = 'a'.repeat(MIN_SECRET_LENGTH);

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('requires at least 32 characters', () => {
    expect(MIN_SECRET_LENGTH).toBe(32);
  });

  it('returns a secret of exactly the minimum length', () => {
    process.env.SOME_SECRET = VALID;

    expect(readSecret('SOME_SECRET')).toBe(VALID);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
  ])('throws when the secret is %s', (_case, value) => {
    if (value === undefined) {
      delete process.env.SOME_SECRET;
    } else {
      process.env.SOME_SECRET = value;
    }

    expect(() => readSecret('SOME_SECRET')).toThrow(
      new Error('SOME_SECRET environment variable is required'),
    );
  });

  it('throws when the secret is one character short, without echoing it', () => {
    const short = 'b'.repeat(MIN_SECRET_LENGTH - 1);
    process.env.SOME_SECRET = short;

    expect(() => readSecret('SOME_SECRET')).toThrow(
      new Error('SOME_SECRET must be at least 32 characters long, got 31'),
    );
  });

  it.each([
    ['leading', ` ${VALID}`],
    ['trailing', `${VALID}\n`],
  ])('throws on %s whitespace, without echoing the secret', (_case, value) => {
    process.env.SOME_SECRET = value;

    expect(() => readSecret('SOME_SECRET')).toThrow(
      new Error('SOME_SECRET must not start or end with whitespace'),
    );
  });
});
