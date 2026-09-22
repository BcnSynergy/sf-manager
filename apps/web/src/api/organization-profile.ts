import { apiFetch } from './client';

// Mirrors apps/api's OrganizationProfileResponseDto — `logoAssetId` is
// DELIBERATELY OMITTED (design.md Decision 4/5, dto/organization-profile-
// response.dto.ts): reserved and unwritable this slice, never exposed even
// as `null`.
export type OrganizationProfile = {
  id: string;
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
};

// design Decision 4: zero statuses in this module have more than one
// reachable cause, so there is no coded-error union here to mirror
// (unlike api/maintenance-company.ts's MaintenanceCompanyErrorCode/
// api/community.ts's CommunityErrorCode) — ApiError.status alone is enough
// for the page to distinguish 400 (validation) from anything else.
export type UpdateOrganizationProfilePayload = {
  name?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
};

export function getOrganizationProfile(): Promise<OrganizationProfile> {
  return apiFetch<OrganizationProfile>('/organization-profile');
}

export function updateOrganizationProfile(
  payload: UpdateOrganizationProfilePayload,
): Promise<OrganizationProfile> {
  return apiFetch<OrganizationProfile>('/organization-profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
