import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from './client';
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
} from './users';

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

const user = {
  id: '1',
  email: 'a@sf-manager.example',
  role: 'SYSTEM_ADMIN' as const,
  maintenanceCompanyId: null,
};

describe('api/users', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('listUsers() GETs /users and returns the parsed list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: true, status: 200, json: async () => [user] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listUsers()).resolves.toEqual([user]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('createUser() POSTs to /users and returns the created user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: true, status: 201, json: async () => user }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createUser({
      email: user.email,
      password: 'irrelevant-but-long-enough',
      role: 'SYSTEM_ADMIN',
    });

    expect(result).toEqual(user);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      email: user.email,
      password: 'irrelevant-but-long-enough',
      role: 'SYSTEM_ADMIN',
    });
  });

  it('createUser() rejects with ApiError{code: EMAIL_ALREADY_IN_USE} on a 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 409,
          json: async () => ({ code: 'EMAIL_ALREADY_IN_USE' }),
        }),
      ),
    );

    const error = await createUser({
      email: user.email,
      password: 'irrelevant-but-long-enough',
      role: 'SYSTEM_ADMIN',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('EMAIL_ALREADY_IN_USE');
  });

  it('updateUser() PATCHes /users/:id and returns the updated user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: true, status: 200, json: async () => user }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateUser('1', { role: 'MANAGER' });

    expect(result).toEqual(user);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ role: 'MANAGER' });
  });

  it('updateUser() rejects with ApiError{code: LAST_SYSTEM_ADMIN} on a 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 409,
          json: async () => ({ code: 'LAST_SYSTEM_ADMIN' }),
        }),
      ),
    );

    const error = await updateUser('1', { role: 'MANAGER' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('LAST_SYSTEM_ADMIN');
  });

  it('deactivateUser() DELETEs /users/:id and resolves to undefined on 204', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deactivateUser('1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/1');
    expect(init.method).toBe('DELETE');
  });

  it('deactivateUser() rejects with ApiError{code: TRANSACTION_CONFLICT} on a 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 409,
          json: async () => ({ code: 'TRANSACTION_CONFLICT' }),
        }),
      ),
    );

    const error = await deactivateUser('1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('TRANSACTION_CONFLICT');
  });
});
