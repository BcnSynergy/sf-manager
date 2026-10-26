import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from './client';
import {
  getOrganizationProfile,
  organizationLogoUrl,
  updateOrganizationProfile,
  uploadOrganizationLogo,
} from './organization-profile';

function mockResponse(init: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: init.json ?? (async () => ({})),
  } as unknown as Response;
}

// design.md Interfaces/Contracts + presentation/dto/organization-profile-
// response.dto.ts: the response DTO omits `logoAssetId` entirely — never
// exposed, not even as `null` (Decision 4/5).
const profile = {
  id: '01997a00-0000-7000-8000-000000000001',
  name: 'Acme Property Management',
  legalName: 'Acme Property Management S.L.',
  taxId: 'B12345678',
  address: '123 Main St',
  phone: '+34600000000',
  email: 'admin@acme.example',
};

function stubFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api/organization-profile', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('getOrganizationProfile() GETs /organization-profile and returns the parsed profile', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => profile }),
    );

    await expect(getOrganizationProfile()).resolves.toEqual(profile);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/organization-profile');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('getOrganizationProfile() rejects with an ApiError on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    const error = await getOrganizationProfile().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });

  it('updateOrganizationProfile() PATCHes /organization-profile with only the supplied fields', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => profile }),
    );

    const result = await updateOrganizationProfile({ name: profile.name, phone: profile.phone });

    expect(result).toEqual(profile);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/organization-profile');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      name: profile.name,
      phone: profile.phone,
    });
  });

  it('updateOrganizationProfile() rejects with an ApiError on a 400 validation failure', async () => {
    stubFetchOnce(
      mockResponse({ ok: false, status: 400, json: async () => ({ message: 'Bad Request' }) }),
    );

    const error = await updateOrganizationProfile({ name: '' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });

  it('uploadOrganizationLogo() PUTs the file as multipart field "file" and returns the profile', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => ({ ...profile, hasLogo: true }) }),
    );
    const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' });

    await expect(uploadOrganizationLogo(file)).resolves.toEqual({ ...profile, hasLogo: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/organization-profile\/logo$/);
    expect(init.method).toBe('PUT');
    expect((init.body as FormData).get('file')).toBe(file);
  });

  it('uploadOrganizationLogo() rejects with the coded ApiError on a 400', async () => {
    stubFetchOnce(
      mockResponse({
        ok: false,
        status: 400,
        json: async () => ({ statusCode: 400, code: 'LOGO_UNSUPPORTED_FORMAT' }),
      }),
    );

    const error = await uploadOrganizationLogo(new File(['x'], 'a.png')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('LOGO_UNSUPPORTED_FORMAT');
  });

  it('organizationLogoUrl() points at the logo endpoint, with a version that changes the URL', () => {
    expect(organizationLogoUrl(0)).toMatch(/\/organization-profile\/logo\?v=0$/);
    expect(organizationLogoUrl(1)).not.toBe(organizationLogoUrl(0));
  });
});
