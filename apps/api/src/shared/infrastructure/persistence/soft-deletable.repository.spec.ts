import { SoftDeletableRepository } from './soft-deletable.repository';

// ADR-010: repositories must exclude soft-deleted rows by default. This base
// class centralizes that filter so every repository extending it gets the
// same enforcement instead of reimplementing it per module (design.md
// Round-3 fix).
class TestRepository extends SoftDeletableRepository {
  buildWhere<TWhere extends Record<string, unknown>>(where: TWhere) {
    return this.withDefaultFilter(where);
  }
}

describe('SoftDeletableRepository', () => {
  const repository = new TestRepository();

  it('merges deletedAt: null into an arbitrary where clause', () => {
    const result = repository.buildWhere({ email: 'admin@example.com' });

    expect(result).toEqual({ email: 'admin@example.com', deletedAt: null });
  });

  it('enforces deletedAt: null even if the caller passed a different value', () => {
    const result = repository.buildWhere({
      email: 'admin@example.com',
      deletedAt: new Date('2026-01-01'),
    });

    expect(result.deletedAt).toBeNull();
  });
});
