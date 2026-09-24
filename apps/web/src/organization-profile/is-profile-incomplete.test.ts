import { describe, expect, it } from 'vitest';
import { isProfileIncomplete, type ProfileFields } from './is-profile-incomplete';

// spec: organization-profile-management "An Incomplete Profile Blocks
// Nothing" / review-document-ui "A Blank or Incomplete Profile Still
// Prints" — incomplete is true whenever any of the six letterhead fields is
// blank, and only then.

const COMPLETE: ProfileFields = {
  name: 'Acme',
  legalName: 'Acme S.L.',
  taxId: 'B12345678',
  address: 'Carrer Major 1',
  phone: '+34 900 000 000',
  email: 'contact@acme.example',
};

describe('isProfileIncomplete', () => {
  it('is false when every field is filled', () => {
    expect(isProfileIncomplete(COMPLETE)).toBe(false);
  });

  it('is true when any single field is blank', () => {
    for (const key of Object.keys(COMPLETE) as (keyof ProfileFields)[]) {
      expect(isProfileIncomplete({ ...COMPLETE, [key]: '' })).toBe(true);
    }
  });

  it('is true when every field is blank', () => {
    expect(
      isProfileIncomplete({
        name: '',
        legalName: '',
        taxId: '',
        address: '',
        phone: '',
        email: '',
      }),
    ).toBe(true);
  });
});
