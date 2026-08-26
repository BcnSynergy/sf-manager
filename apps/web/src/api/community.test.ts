import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from './client';
import {
  listCommunities,
  createCommunity,
  updateCommunity,
  softDeleteCommunity,
  listRepresentatives,
  addRepresentative,
  deactivateRepresentative,
  reactivateRepresentative,
  listTechnicians,
  addTechnician,
  deactivateTechnician,
  reactivateTechnician,
} from './community';

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

const community = {
  id: 'c1',
  name: 'Sunset Towers',
  address: '123 Sunset Blvd',
  locale: 'en' as const,
};

const activeAssignment = { communityId: 'c1', userId: 'u1', deactivatedAt: null };
const deactivatedAssignment = {
  communityId: 'c1',
  userId: 'u2',
  deactivatedAt: '2026-08-01T00:00:00.000Z',
};

function stubFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api/community', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('listCommunities() GETs /communities and returns the parsed list', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => [community] }),
    );

    await expect(listCommunities()).resolves.toEqual([community]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('createCommunity() POSTs to /communities and returns the created community', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 201, json: async () => community }),
    );

    const result = await createCommunity({
      name: community.name,
      address: community.address,
      locale: community.locale,
    });

    expect(result).toEqual(community);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: community.name,
      address: community.address,
      locale: community.locale,
    });
  });

  it('updateCommunity() PATCHes /communities/:id and returns the updated community', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => community }),
    );

    const result = await updateCommunity('c1', { name: 'New Name' });

    expect(result).toEqual(community);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'New Name' });
  });

  it('softDeleteCommunity() DELETEs /communities/:id and resolves to undefined on 204', async () => {
    const fetchMock = stubFetchOnce(mockResponse({ ok: true, status: 204 }));

    await expect(softDeleteCommunity('c1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1');
    expect(init.method).toBe('DELETE');
  });

  it('listRepresentatives() GETs /communities/:id/representatives and returns active+deactivated rows', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => [activeAssignment, deactivatedAssignment],
      }),
    );

    await expect(listRepresentatives('c1')).resolves.toEqual([
      activeAssignment,
      deactivatedAssignment,
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1/representatives');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('addRepresentative() POSTs {userId} to /communities/:id/representatives', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 201, json: async () => activeAssignment }),
    );

    const result = await addRepresentative('c1', 'u1');

    expect(result).toEqual(activeAssignment);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1/representatives');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ userId: 'u1' });
  });

  it('addRepresentative() passes an unread warning field through unfiltered', async () => {
    const withWarning = {
      ...activeAssignment,
      warning: { code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES', communityCount: 2 },
    };
    stubFetchOnce(mockResponse({ ok: true, status: 201, json: async () => withWarning }));

    await expect(addRepresentative('c1', 'u1')).resolves.toEqual(withWarning);
  });

  it('addRepresentative() rejects with ApiError{code: ASSIGNMENT_ALREADY_EXISTS} on a 409', async () => {
    stubFetchOnce(
      mockResponse({
        ok: false,
        status: 409,
        json: async () => ({ code: 'ASSIGNMENT_ALREADY_EXISTS' }),
      }),
    );

    const error = await addRepresentative('c1', 'u1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('ASSIGNMENT_ALREADY_EXISTS');
  });

  it('addRepresentative() rejects with ApiError{code: TRANSACTION_CONFLICT} on a 409', async () => {
    stubFetchOnce(
      mockResponse({
        ok: false,
        status: 409,
        json: async () => ({ code: 'TRANSACTION_CONFLICT' }),
      }),
    );

    const error = await addRepresentative('c1', 'u1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('TRANSACTION_CONFLICT');
  });

  it('deactivateRepresentative() DELETEs /communities/:id/representatives/:userId, resolves undefined on 204', async () => {
    const fetchMock = stubFetchOnce(mockResponse({ ok: true, status: 204 }));

    await expect(deactivateRepresentative('c1', 'u1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1/representatives/u1');
    expect(init.method).toBe('DELETE');
  });

  it('reactivateRepresentative() POSTs to .../representatives/:userId/reactivate', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => activeAssignment }),
    );

    const result = await reactivateRepresentative('c1', 'u2');

    expect(result).toEqual(activeAssignment);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1/representatives/u2/reactivate');
    expect(init.method).toBe('POST');
  });

  it('reactivateRepresentative() rejects with ApiError{code: INELIGIBLE_ROLE} on a 409', async () => {
    stubFetchOnce(
      mockResponse({
        ok: false,
        status: 409,
        json: async () => ({ code: 'INELIGIBLE_ROLE' }),
      }),
    );

    const error = await reactivateRepresentative('c1', 'u2').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INELIGIBLE_ROLE');
  });

  it('listTechnicians() GETs /communities/:id/technicians and returns active+deactivated rows', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => [activeAssignment, deactivatedAssignment],
      }),
    );

    await expect(listTechnicians('c1')).resolves.toEqual([
      activeAssignment,
      deactivatedAssignment,
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1/technicians');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('addTechnician() POSTs {userId} to /communities/:id/technicians', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 201, json: async () => activeAssignment }),
    );

    const result = await addTechnician('c1', 'u1');

    expect(result).toEqual(activeAssignment);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1/technicians');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ userId: 'u1' });
  });

  it('addTechnician() rejects with ApiError{code: ASSIGNMENT_ALREADY_EXISTS} on a 409', async () => {
    stubFetchOnce(
      mockResponse({
        ok: false,
        status: 409,
        json: async () => ({ code: 'ASSIGNMENT_ALREADY_EXISTS' }),
      }),
    );

    const error = await addTechnician('c1', 'u1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('ASSIGNMENT_ALREADY_EXISTS');
  });

  it('deactivateTechnician() DELETEs /communities/:id/technicians/:userId, resolves undefined on 204', async () => {
    const fetchMock = stubFetchOnce(mockResponse({ ok: true, status: 204 }));

    await expect(deactivateTechnician('c1', 'u1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1/technicians/u1');
    expect(init.method).toBe('DELETE');
  });

  it('reactivateTechnician() POSTs to .../technicians/:userId/reactivate', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => activeAssignment }),
    );

    const result = await reactivateTechnician('c1', 'u2');

    expect(result).toEqual(activeAssignment);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/communities/c1/technicians/u2/reactivate');
    expect(init.method).toBe('POST');
  });

  it('reactivateTechnician() rejects with ApiError{code: INELIGIBLE_ROLE} on a 409', async () => {
    stubFetchOnce(
      mockResponse({
        ok: false,
        status: 409,
        json: async () => ({ code: 'INELIGIBLE_ROLE' }),
      }),
    );

    const error = await reactivateTechnician('c1', 'u2').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INELIGIBLE_ROLE');
  });

  it('a 404 on any assignment action carries no code (Generic Not-Found Handling)', async () => {
    stubFetchOnce(mockResponse({ ok: false, status: 404, json: async () => ({}) }));

    const error = await addRepresentative('c1', 'unknown-user').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBeUndefined();
  });
});
