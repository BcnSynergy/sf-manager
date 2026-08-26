import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError } from './client';

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

describe('apiFetch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed body on a successful (200) response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ ok: true, status: 200, json: async () => ({ id: '1' }) }),
      ),
    );

    await expect(apiFetch('/users')).resolves.toEqual({ id: '1' });
  });

  it('resolves to undefined on a 204 No Content response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 204 })),
    );

    await expect(apiFetch('/users/1')).resolves.toBeUndefined();
  });

  it('throws ApiError with the discriminator code on a 409 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 409,
          json: async () => ({
            statusCode: 409,
            error: 'Conflict',
            message: 'Email already in use',
            code: 'EMAIL_ALREADY_IN_USE',
          }),
        }),
      ),
    );

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).code).toBe('EMAIL_ALREADY_IN_USE');
  });

  it('throws ApiError without a code when the error body cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 500,
          json: async () => {
            throw new Error('not JSON');
          },
        }),
      ),
    );

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).code).toBeUndefined();
  });

  it('throws ApiError with status 0 when the network request itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).code).toBeUndefined();
  });
});
