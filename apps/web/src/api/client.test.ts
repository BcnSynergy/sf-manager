import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  advanceSessionEpoch,
  apiFetch,
  ApiError,
  refreshSession,
  setUnauthorizedHandler,
} from './client';

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
      vi
        .fn()
        .mockResolvedValue(
          mockResponse({ ok: true, status: 200, json: async () => ({ id: '1' }) }),
        ),
    );

    await expect(apiFetch('/users')).resolves.toEqual({ id: '1' });
  });

  it('resolves to undefined on a 204 No Content response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 204 })));

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
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

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

  it('sends a JSON body with Content-Type application/json', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/users', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('leaves Content-Type unset for a FormData body, so the browser adds the multipart boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const body = new FormData();
    body.append('file', new Blob(['x']), 'logo.png');

    await apiFetch('/organization-profile/logo', { method: 'PUT', body });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(body);
    expect(init.headers).toBeUndefined();
  });
});

describe('apiFetch — unauthorized handler', () => {
  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  function stubStatus(status: number) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status })));
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

  // stale-401-session-guard design.md Decision 1/2: the epoch is compared
  // relative to the value captured at request start, so no reset hook is
  // needed between tests.
  it('skips the handler but still throws ApiError(401) when the epoch advances mid-request', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    let respond!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
      ),
    );

    const pending = apiFetch('/users').catch((e: unknown) => e);
    advanceSessionEpoch();
    respond(mockResponse({ ok: false, status: 401 }));
    const error = await pending;

    expect(handler).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it('invokes the handler when the epoch advanced before the request started', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    advanceSessionEpoch();
    stubStatus(401);

    await apiFetch('/users').catch(() => undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// TD-5 S8: a 401 first tries one silent refresh (POST /auth/refresh with the
// refresh cookie), serialized across tabs, then retries the request once.
// Only a failed refresh ends the session.
describe('apiFetch — silent refresh (TD-5)', () => {
  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  function respond(...responses: Array<Response | Error>) {
    const fetchMock = vi.fn();
    for (const response of responses) {
      if (response instanceof Error) {
        fetchMock.mockRejectedValueOnce(response);
      } else {
        fetchMock.mockResolvedValueOnce(response);
      }
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const unauthorized = () => mockResponse({ ok: false, status: 401 });
  const ok = (body: unknown) => mockResponse({ ok: true, status: 200, json: async () => body });

  function urls(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''));
  }

  it('refreshes once on a 401 and retries the request, without ending the session', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = respond(unauthorized(), ok({ id: '1' }), ok({ data: 'fresh' }));

    await expect(apiFetch('/users')).resolves.toEqual({ data: 'fresh' });

    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
    const [, refreshInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshInit).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('ends the session when the refresh itself is refused, without retrying the request', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = respond(unauthorized(), unauthorized());

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh']);
  });

  it('retries only once: a 401 on the retried request ends the session without another refresh', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = respond(unauthorized(), ok({ id: '1' }), unauthorized());

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
  });

  it('shares one refresh between requests that get a 401 at the same time', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const href = String(url);
      if (href.endsWith('/auth/refresh')) {
        return Promise.resolve(ok({ id: '1' }));
      }
      const firstTry = fetchMock.mock.calls.filter(([u]) => String(u) === href).length === 1;
      return Promise.resolve(firstTry ? unauthorized() : ok({ path: href }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([apiFetch('/a'), apiFetch('/b')]);

    expect(urls(fetchMock).filter((u) => u === '/auth/refresh')).toHaveLength(1);
  });

  it('retries a refresh whose response was lost to a network error once, at once', async () => {
    const fetchMock = respond(
      unauthorized(),
      new TypeError('Failed to fetch'),
      ok({ id: '1' }),
      ok({ data: 'fresh' }),
    );

    await expect(apiFetch('/users')).resolves.toEqual({ data: 'fresh' });

    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/auth/refresh', '/users']);
  });

  it('serializes the refresh across tabs with a Web Lock when the browser has them', async () => {
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => callback());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    respond(unauthorized(), ok({ id: '1' }), ok({ data: 'fresh' }));

    await apiFetch('/users');

    expect(request).toHaveBeenCalledWith('sf-manager.refresh', expect.any(Function));
  });

  it('neither retries nor ends the session when the session changed during the refresh (logout or new login)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockImplementationOnce(() => {
        advanceSessionEpoch();
        return Promise.resolve(ok({ id: '1' }));
      });
    vi.stubGlobal('fetch', fetchMock);

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh']);
  });
});

describe('refreshSession (TD-5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the user the refresh answers with, and null when it is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          mockResponse({ ok: true, status: 200, json: async () => ({ id: '7' }) }),
        )
        .mockResolvedValueOnce(mockResponse({ ok: false, status: 401 })),
    );

    await expect(refreshSession()).resolves.toEqual({ id: '7' });
    await expect(refreshSession()).resolves.toBeNull();
  });
});
