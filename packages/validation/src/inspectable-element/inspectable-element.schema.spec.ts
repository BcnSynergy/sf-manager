import { describe, expect, it } from 'vitest';
import { updateInspectableElementSchema } from './inspectable-element.schema';

// review-session/design.md Decision 3: `deactivated` is a plain optional
// boolean on updateInspectableElementSchema — no Value Object (ADR-006
// walking-skeleton discipline). This boundary test only covers `deactivated`
// itself; the schema's other fields have no existing spec coverage in this
// package to extend.
describe('updateInspectableElementSchema — deactivated field', () => {
  it('accepts a boolean deactivated value', () => {
    expect(
      updateInspectableElementSchema.safeParse({ deactivated: true }).success,
    ).toBe(true);
    expect(
      updateInspectableElementSchema.safeParse({ deactivated: false }).success,
    ).toBe(true);
  });

  it('accepts an absent deactivated field', () => {
    expect(updateInspectableElementSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a string "true" for deactivated', () => {
    expect(
      updateInspectableElementSchema.safeParse({ deactivated: 'true' }).success,
    ).toBe(false);
  });

  it('rejects a number for deactivated', () => {
    expect(
      updateInspectableElementSchema.safeParse({ deactivated: 1 }).success,
    ).toBe(false);
  });

  it('rejects null for deactivated', () => {
    expect(
      updateInspectableElementSchema.safeParse({ deactivated: null }).success,
    ).toBe(false);
  });
});
