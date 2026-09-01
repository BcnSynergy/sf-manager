import { CommunityHasActiveElementsError } from './errors/community-has-active-elements.error';
import { assertNoActiveElementsAttached } from './community-deletion.policy';

// design.md Decision 6: pure domain function, no ports, no I/O, no
// repository reference — mirrors
// `maintenance-company-deletion.policy.ts`'s `assertNoActiveUsersAttached`
// exactly. The use case owns the read (`countActiveByCommunity`, filtered to
// `deletedAt: null` for free); this function only enforces the invariant
// (community-management spec.md "Soft-Delete Community").
describe('assertNoActiveElementsAttached', () => {
  it('passes when there are zero active elements attached', () => {
    expect(() => assertNoActiveElementsAttached(0)).not.toThrow();
  });

  it('throws CommunityHasActiveElementsError when exactly one active element is attached', () => {
    expect(() => assertNoActiveElementsAttached(1)).toThrow(
      CommunityHasActiveElementsError,
    );
  });

  it('throws CommunityHasActiveElementsError when several active elements are attached', () => {
    expect(() => assertNoActiveElementsAttached(5)).toThrow(
      CommunityHasActiveElementsError,
    );
  });

  it('carries the active element count on the thrown error (design.md Decision 6)', () => {
    try {
      assertNoActiveElementsAttached(3);
      throw new Error('expected assertNoActiveElementsAttached to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CommunityHasActiveElementsError);
      expect(
        (error as CommunityHasActiveElementsError).activeElementCount,
      ).toBe(3);
    }
  });
});
