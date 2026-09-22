import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from './client';
import { getOrganizationProfile, updateOrganizationProfile } from './organization-profile';

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('network down')),
    );

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
});
