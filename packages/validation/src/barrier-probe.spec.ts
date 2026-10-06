import { describe, expect, it } from 'vitest';

// Throwaway probe for ci-pipeline B.6: this PR must be blocked. Never merge.
describe('CI merge barrier probe', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
