import { Prisma } from '@prisma/client';
import { isUniqueViolationOf } from './prisma-unique-violation';

// TD-49: the contract every caller relies on. @prisma/adapter-pg reports the
// violated constraint by name (`index`, 7.10+) or by quoted columns
// (`fields`, 7.9); the name wins when present, columns must match exactly,
// and any unreadable shape is "not this constraint".
const PAIR = { name: 'Thing_a_b_key', columns: ['a', 'b'] };

const p2002 = (meta: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta,
  });

const withConstraint = (constraint: unknown) =>
  p2002({ driverAdapterError: { cause: { constraint } } });

describe('isUniqueViolationOf', () => {
  it('matches the constraint by name', () => {
    expect(
      isUniqueViolationOf(withConstraint({ index: 'Thing_a_b_key' }), PAIR),
    ).toBe(true);
  });

  it('does not match another constraint name', () => {
    expect(
      isUniqueViolationOf(withConstraint({ index: 'Thing_a_partial' }), PAIR),
    ).toBe(false);
  });

  it('lets the name win over columns that would match', () => {
    expect(
      isUniqueViolationOf(
        withConstraint({ index: 'Thing_a_partial', fields: ['"a"', '"b"'] }),
        PAIR,
      ),
    ).toBe(false);
  });

  it('matches by quoted columns when no name is reported', () => {
    expect(
      isUniqueViolationOf(withConstraint({ fields: ['"b"', '"a"'] }), PAIR),
    ).toBe(true);
  });

  it('does not match a subset of the columns', () => {
    expect(isUniqueViolationOf(withConstraint({ fields: ['"a"'] }), PAIR)).toBe(
      false,
    );
  });

  it('does not match a superset of the columns', () => {
    expect(
      isUniqueViolationOf(
        withConstraint({ fields: ['"a"', '"b"', '"c"'] }),
        PAIR,
      ),
    ).toBe(false);
  });

  it.each([
    ['no meta', p2002({})],
    ['no constraint', withConstraint(undefined)],
    ['a constraint with neither index nor fields', withConstraint({})],
  ])('returns false for an unreadable shape: %s', (_label, error) => {
    expect(isUniqueViolationOf(error, PAIR)).toBe(false);
  });

  it('returns false for a non-P2002 Prisma error', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: 'test',
      // A constraint that would match on a P2002, so only the code decides.
      meta: {
        driverAdapterError: { cause: { constraint: { index: PAIR.name } } },
      },
    });
    expect(isUniqueViolationOf(error, PAIR)).toBe(false);
  });

  it('returns false for a non-Prisma error', () => {
    expect(isUniqueViolationOf(new Error('boom'), PAIR)).toBe(false);
  });
});
