// spec: organization-profile-management "An Incomplete Profile Blocks
// Nothing" / review-document-ui "A Blank or Incomplete Profile Still
// Prints" — shared predicate: a profile is incomplete when any of its six
// letterhead fields is blank. Extracted from OrganizationProfilePage.tsx
// (design.md Decision 4) so the review document page can reuse the exact
// same rule for its own warning.
export interface ProfileFields {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
}

const FIELD_KEYS: (keyof ProfileFields)[] = [
  'name',
  'legalName',
  'taxId',
  'address',
  'phone',
  'email',
];

export function isProfileIncomplete(fields: ProfileFields): boolean {
  return FIELD_KEYS.some((key) => fields[key] === '');
}
