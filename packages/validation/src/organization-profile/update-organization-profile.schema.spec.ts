import { describe, expect, it } from 'vitest';
import { updateOrganizationProfileSchema } from './update-organization-profile.schema';

// design.md Testing Strategy (Unit — schema) + tasks.md 3.4, mirroring
// update-user.schema.spec.ts's structure: all six fields optional; a
// supplied field must be non-blank after trim; email format enforced but
// NOT lower-cased (design.md Decision 2); taxId is trim-only, NOT
// upper-cased (design.md Decision 2 — do not import taxIdSchema from
// maintenance-company); logoAssetId has no schema key at all, so it is
// stripped rather than rejected (design.md Interfaces/Contracts).
describe('updateOrganizationProfileSchema', () => {
  it('accepts an empty body — every field is optional', () => {
    const result = updateOrganizationProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a subset of fields', () => {
    const result = updateOrganizationProfileSchema.safeParse({
      name: 'Community Managers SL',
      email: 'info@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: 'Community Managers SL',
        email: 'info@example.com',
      });
    }
  });

  it('accepts all six fields supplied together', () => {
    const result = updateOrganizationProfileSchema.safeParse({
      name: 'Community Managers SL',
      legalName: 'Community Managers Sociedad Limitada',
      taxId: 'b12345678',
      address: 'Carrer Major 1, Girona',
      phone: '972000000',
      email: 'info@example.com',
    });
    expect(result.success).toBe(true);
  });

  it.each(['name', 'legalName', 'taxId', 'address', 'phone', 'email'])(
    'rejects %s as an empty string when supplied',
    (field) => {
      const result = updateOrganizationProfileSchema.safeParse({
        [field]: '',
      });
      expect(result.success).toBe(false);
    },
  );

  it.each(['name', 'legalName', 'taxId', 'address', 'phone'])(
    'rejects %s as whitespace-only when supplied',
    (field) => {
      const result = updateOrganizationProfileSchema.safeParse({
        [field]: '   ',
      });
      expect(result.success).toBe(false);
    },
  );

  it.each(['name', 'legalName', 'taxId', 'address', 'phone', 'email'])(
    'rejects %s as an explicit null, not as a clear',
    (field) => {
      const result = updateOrganizationProfileSchema.safeParse({
        [field]: null,
      });
      expect(result.success).toBe(false);
    },
  );

  it('rejects an email with no valid format', () => {
    const result = updateOrganizationProfileSchema.safeParse({
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('trims a supplied field with leading/trailing whitespace', () => {
    const result = updateOrganizationProfileSchema.safeParse({
      name: '  Community Managers SL  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Community Managers SL');
    }
  });

  it('does NOT upper-case taxId (design.md Decision 2 — no uniqueness to canonicalize for)', () => {
    const result = updateOrganizationProfileSchema.safeParse({
      taxId: 'b12345678',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taxId).toBe('b12345678');
    }
  });

  it('does NOT lower-case email (design.md Decision 2 — contact data, not a login identity)', () => {
    const result = updateOrganizationProfileSchema.safeParse({
      email: 'Info@Example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('Info@Example.com');
    }
  });

  it('strips a logoAssetId supplied in the payload instead of validating or rejecting it (unwritable by construction)', () => {
    const result = updateOrganizationProfileSchema.safeParse({
      name: 'Community Managers SL',
      logoAssetId: 'some-asset-id',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>).logoAssetId,
      ).toBeUndefined();
    }
  });

  it('accepts a body carrying only unrecognized properties', () => {
    const result = updateOrganizationProfileSchema.safeParse({
      unknownField: 'whatever',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>).unknownField,
      ).toBeUndefined();
    }
  });
});
