import { API_BASE_URL, apiFetch } from './client';

// Mirrors apps/api's OrganizationProfileResponseDto — `logoAssetId` (a
// storage key) is never exposed; `hasLogo` says whether a logo exists, and
// the image itself is read from organizationLogoUrl().
export type OrganizationProfile = {
  id: string;
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  hasLogo: boolean;
};

// Mirrors apps/api's OrganizationProfileErrorCode: the three 400 causes on
// the logo upload (organization-logo, EN-111). The profile update still has
// a single 400 cause, so ApiError.status alone is enough there.
export type OrganizationProfileErrorCode =
  'LOGO_FILE_MISSING' | 'LOGO_UNSUPPORTED_FORMAT' | 'LOGO_UPLOAD_INVALID';
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

// organization-logo: multipart upload, field `file`. Resolves to the profile
// with `hasLogo: true`.
export function uploadOrganizationLogo(file: File): Promise<OrganizationProfile> {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<OrganizationProfile>('/organization-profile/logo', {
    method: 'PUT',
    body,
  });
}

// EN-110: removes the logo. Resolves to the profile with `hasLogo: false`,
// also when there was no logo.
export function removeOrganizationLogo(): Promise<OrganizationProfile> {
  return apiFetch<OrganizationProfile>('/organization-profile/logo', {
    method: 'DELETE',
  });
}

// The logo is an <img> source, not a fetch: the browser sends the session
// cookie itself. `version` changes the URL after an upload so the image is
// requested again.
export function organizationLogoUrl(version: number): string {
  return `${API_BASE_URL}/organization-profile/logo?v=${version}`;
}
