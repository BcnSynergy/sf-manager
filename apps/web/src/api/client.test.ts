import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError, setUnauthorizedHandler } from './client';

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

  afterEach(() => {
    setUnauthorizedHandler(null);
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

  it('throws ApiError without a code on an error response whose JSON body has no code field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 400,
          json: async () => ({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Password does not meet requirements',
          }),
        }),
      ),
    );

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).code).toBeUndefined();
  });

  // review-session design.md Decision 2 / spec "Complete a Session and
  // Explain Its Gaps": the 409 UNREVIEWED_ELEMENTS_WITHOUT_REASON body
  // carries an `elementCodes` array the UI must list. `ApiError` previously
  // only kept `status`/`code`; this is the first caller that needs a third
  // field off the error body, so `extra` is added as an additive,
  // backward-compatible capture of the full parsed body rather than a
  // one-off `elementCodes`-shaped field — a future coded error with a
  // different extra payload shape reuses the same mechanism.
  it('captures additional error-body fields on ApiError.extra', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 409,
          json: async () => ({
            statusCode: 409,
            error: 'Conflict',
            message: 'Unreviewed elements remain',
            code: 'UNREVIEWED_ELEMENTS_WITHOUT_REASON',
            elementCodes: ['23456789AB', 'CDEFGHJKMN'],
          }),
        }),
      ),
    );

    const error = await apiFetch('/review-sessions/1/complete', { method: 'POST' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNREVIEWED_ELEMENTS_WITHOUT_REASON');
    expect((error as ApiError).extra).toEqual({
      elementCodes: ['23456789AB', 'CDEFGHJKMN'],
    });
  });

  it('leaves ApiError.extra undefined when the error body has no fields beyond code', async () => {
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

    expect((error as ApiError).extra).toBeUndefined();
  });

  it('throws ApiError with status 0 on a successful (200) response with an unparseable body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('not JSON');
          },
        }),
      ),
    );

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });
});

describe('apiFetch — unauthorized handler', () => {
  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  function stubStatus(status: number) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ ok: false, status })),
    );
  }

  it('invokes the registered handler on a 401 and still throws ApiError(401)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubStatus(401);

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it.each([403, 500])('does not invoke the handler on a %i', async (status) => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubStatus(status);

    await apiFetch('/users').catch(() => undefined);

    expect(handler).not.toHaveBeenCalled();
  });

  it('still throws ApiError(401) when no handler is registered', async () => {
    stubStatus(401);

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(401);
  });

  it('stops invoking a handler once it is cleared with null', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setUnauthorizedHandler(null);
    stubStatus(401);

    await apiFetch('/users').catch(() => undefined);

    expect(handler).not.toHaveBeenCalled();
  });
});
