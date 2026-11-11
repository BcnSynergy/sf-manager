import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  advanceSessionEpoch,
  apiFetch,
  ApiError,
  refreshSession,
  setUnauthorizedHandler,
  settleRefresh,
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

  function respond(...responses: Array<Response | Error | DOMException>) {
    const fetchMock = vi.fn();
    for (const response of responses) {
      if (response instanceof Error || response instanceof DOMException) {
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

  type LockCallback = (lock: { name: string } | null) => unknown;

  // A Web Locks stand-in shared by "tabs": one lock per name, granted in
  // request order (shared and exclusive alike); `query()` reports whether it
  // is held. Installed on navigator.locks.
  function installFakeLocks() {
    let tail: Promise<void> = Promise.resolve();
    let held = false;
    const request = vi.fn(
      async (
        name: string,
        optionsOrCallback: { mode?: 'shared' | 'exclusive' } | LockCallback,
        maybeCallback?: LockCallback,
      ) => {
        const callback = (
          typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
        ) as LockCallback;
        const previous = tail;
        let release: () => void = () => undefined;
        tail = new Promise((resolve) => (release = resolve));
        await previous;
        held = true;
        try {
          return await callback({ name });
        } finally {
          held = false;
          release();
        }
      },
    );
    type LockInfo = { name: string; mode: string };
    const query = vi.fn(async (): Promise<{ held: LockInfo[]; pending: LockInfo[] }> => ({
      held: held ? [{ name: 'sf-manager.refresh', mode: 'exclusive' }] : [],
      pending: [],
    }));
    vi.stubGlobal('navigator', { ...navigator, locks: { request, query } });
    return {
      request,
      query,
      isHeld: () => held,
      // Another tab takes the lock and keeps it until the returned function runs.
      holdByOtherTab(): () => void {
        let releaseOtherTab: () => void = () => undefined;
        void request(
          'sf-manager.refresh',
          () => new Promise<void>((resolve) => (releaseOtherTab = resolve)),
        );
        return () => releaseOtherTab();
      },
    };
  }

  it('refreshes once on a 401 and retries the request, without ending the session', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = respond(unauthorized(), ok({ id: '1' }), ok({ data: 'fresh' }));

    await expect(apiFetch('/users')).resolves.toEqual({ data: 'fresh' });

    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
    const [, refreshInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshInit).toMatchObject({ method: 'POST', credentials: 'include' });
    // A stalled refresh must not hold the cross-tab lock forever.
    expect(refreshInit.signal).toBeInstanceOf(AbortSignal);
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

  // Only a refusal ends the session: an unreachable refresh (API restarting,
  // network down, 5xx) must not log users out whose refresh token is valid.
  it.each([502, 503, 500])(
    'keeps the session when the refresh answers %i, failing the call with that status',
    async (status) => {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      const fetchMock = respond(unauthorized(), mockResponse({ ok: false, status }));

      const error = await apiFetch('/users').catch((e: unknown) => e);

      expect((error as ApiError).status).toBe(status);
      expect(handler).not.toHaveBeenCalled();
      expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh']);
    },
  );

  it('keeps the session when the refresh is unreachable twice, failing the call with status 0', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(unauthorized(), new TypeError('Failed to fetch'), new TypeError('Failed to fetch'));

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('retries once after a network error that is not our timeout, then keeps the session', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const failure = () => new DOMException('connection reset', 'NetworkError');
    const fetchMock = respond(unauthorized(), failure(), failure());

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(0);
    expect(handler).not.toHaveBeenCalled();
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/auth/refresh']);
  });

  // Rate-limited is not refused: the refresh cookie is still valid.
  it('keeps the session when the refresh is rate-limited (429), failing the call with 429', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(unauthorized(), mockResponse({ ok: false, status: 429 }));

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps the session when a successful refresh has an unreadable body', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(
      unauthorized(),
      mockResponse({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }),
    );

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('also bounds reading the refresh body: a body that never arrives is abandoned after 9 seconds', async () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      const stalledBody = (_url: string, init?: RequestInit) =>
        Promise.resolve(
          mockResponse({
            ok: true,
            status: 200,
            json: () =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () =>
                  reject(new DOMException('aborted', 'AbortError')),
                );
              }),
          }),
        );
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockImplementationOnce(stalledBody);
      vi.stubGlobal('fetch', fetchMock);

      const pending = apiFetch('/users').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(8_999);
      expect(await Promise.race([pending, Promise.resolve('still pending')])).toBe('still pending');
      await vi.advanceTimersByTimeAsync(1);
      const error = await Promise.race([pending, Promise.resolve('still pending')]);

      expect(error).not.toBe('still pending');
      expect((error as ApiError).status).toBe(0);
      expect(handler).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // No retry after a timeout: the stalled request may have consumed the token
  // server-side, and a retry 9 s later could land outside the grace window
  // and revoke the whole family.
  it('aborts a refresh that never answers after 9 seconds, without retrying, keeping the session (no AbortSignal.timeout needed)', async () => {
    vi.useFakeTimers();
    try {
      // Older browsers (Safari < 16) lack AbortSignal.timeout.
      vi.stubGlobal('AbortSignal', { ...AbortSignal, timeout: undefined });
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      const stalled = (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      // Only one refresh attempt is queued: a retry would make a third call.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockImplementationOnce(stalled);
      vi.stubGlobal('fetch', fetchMock);

      const pending = apiFetch('/users').catch((e: unknown) => e);
      // Still waiting just before the deadline.
      await vi.advanceTimersByTimeAsync(8_999);
      expect(await Promise.race([pending, Promise.resolve('still pending')])).toBe('still pending');
      await vi.advanceTimersByTimeAsync(1);
      const error = await Promise.race([pending, Promise.resolve('still pending')]);

      expect(error).not.toBe('still pending');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      expect((error as ApiError).status).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // One 9 s deadline for both attempts, counted from the first send: the
  // lock is held at most 9 s and a retry lands inside the API's 10 s grace
  // window with a second to spare for latency.
  it('gives a retry after a late network error only the time left of one 9-second deadline', async () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      const failsAt8s = () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => reject(new TypeError('connection reset')), 8_000);
        });
      const stalled = (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockImplementationOnce(failsAt8s)
        .mockImplementationOnce(stalled);
      vi.stubGlobal('fetch', fetchMock);

      const pending = apiFetch('/users').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(9_000);
      // Settled by now; a retry given a fresh 9 s would still be pending.
      const error = await Promise.race([pending, Promise.resolve('still pending')]);

      expect(error).not.toBe('still pending');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect((error as ApiError).status).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // The deadline is checked before every attempt, not only through the abort
  // timer: when the clock has passed it (here it jumps forward while the
  // first attempt is in flight), no retry is sent even after a network error.
  it('sends no retry once the deadline has passed, even after a network error', async () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      const failsAfterClockJump = () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => {
            vi.setSystemTime(Date.now() + 20_000);
            reject(new TypeError('connection reset'));
          }, 1_000);
        });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockImplementationOnce(failsAfterClockJump);
      vi.stubGlobal('fetch', fetchMock);

      const pending = apiFetch('/users').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1_000);
      const error = await Promise.race([pending, Promise.resolve('still pending')]);

      expect(error).not.toBe('still pending');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((error as ApiError).status).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // A timed-out attempt is never retried, even when the clock stepped back
  // (an NTP adjustment) and the deadline check alone would allow it.
  it('does not retry a timed-out refresh when the clock stepped back during it', async () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      const stalledThenClockStepsBack = (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            vi.setSystemTime(Date.now() - 5_000);
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockImplementationOnce(stalledThenClockStepsBack);
      vi.stubGlobal('fetch', fetchMock);

      const pending = apiFetch('/users').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      const error = await Promise.race([pending, Promise.resolve('still pending')]);

      expect(error).not.toBe('still pending');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((error as ApiError).status).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a 403 from the refresh (foreign origin) as a refusal that ends the session', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(unauthorized(), mockResponse({ ok: false, status: 403 }));

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('refreshes while holding the cross-tab Web Lock when the browser has them', async () => {
    const locks = installFakeLocks();
    let heldDuringRefresh: boolean | undefined;
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        heldDuringRefresh = locks.isHeld();
        return Promise.resolve(ok({ id: '1' }));
      }
      return Promise.resolve(fetchMock.mock.calls.length === 1 ? unauthorized() : ok({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/users');

    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
    expect(heldDuringRefresh).toBe(true);
    expect(locks.request).toHaveBeenCalledWith('sf-manager.refresh', expect.any(Function));
  });

  // EN-142: the other tab's refresh already put fresh cookies in the shared
  // jar, so a second refresh would only rotate the token again.
  it('waits for another tab refreshing and retries with its cookies, without refreshing again', async () => {
    const locks = installFakeLocks();
    const releaseOtherTab = locks.holdByOtherTab();
    const fetchMock = respond(unauthorized(), ok({ data: 'fresh' }));

    const pending = apiFetch<{ data: string }>('/users');
    // A full macrotask, so a call that skipped the wait would have retried.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(urls(fetchMock)).toEqual(['/users']);

    releaseOtherTab();

    await expect(pending).resolves.toEqual({ data: 'fresh' });
    expect(urls(fetchMock)).toEqual(['/users', '/users']);
  });

  // While one tab hands the lock to another tab's queued refresh, query()
  // can show it only as pending; that still counts as a refresh to wait for.
  it('also waits when another tab refresh is only queued for the lock', async () => {
    const locks = installFakeLocks();
    const releaseOtherTab = locks.holdByOtherTab();
    locks.query.mockResolvedValueOnce({
      held: [],
      pending: [{ name: 'sf-manager.refresh', mode: 'exclusive' }],
    });
    const fetchMock = respond(unauthorized(), ok({ data: 'fresh' }));

    const pending = apiFetch<{ data: string }>('/users');
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseOtherTab();

    await expect(pending).resolves.toEqual({ data: 'fresh' });
    expect(urls(fetchMock)).toEqual(['/users', '/users']);
  });

  // Logout waits for it too: the other tab's refresh may still set fresh
  // cookies after the logout cleared them.
  it('makes settleRefresh wait while a call waits for another tab refresh', async () => {
    const locks = installFakeLocks();
    const releaseOtherTab = locks.holdByOtherTab();
    respond(unauthorized(), ok({ data: 'fresh' }));

    const pending = apiFetch('/users');
    await new Promise((resolve) => setTimeout(resolve, 0));
    let settled = false;
    const waiting = settleRefresh().then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    releaseOtherTab();
    await waiting;
    await pending;

    expect(settled).toBe(true);
  });

  // A frozen tab could hold the lock indefinitely: logout stops waiting for
  // other tabs after the refresh deadline (9 s).
  it('bounds how long settleRefresh waits for another tab refresh', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseOtherTab = locks.holdByOtherTab();
      respond(unauthorized(), unauthorized(), unauthorized());

      const call = apiFetch('/users').catch(() => undefined);
      await vi.advanceTimersByTimeAsync(0);
      let settled = false;
      void settleRefresh().then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(8_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);

      // Leave no wait behind for later tests (the module state persists).
      releaseOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      await call;
    } finally {
      vi.useRealTimers();
    }
  });

  // Calls waiting for a refresh hold the lock in shared mode; only an
  // exclusive entry is a refresh worth waiting for.
  it('does not wait when the lock shows only other calls waiting', async () => {
    const locks = installFakeLocks();
    locks.query.mockResolvedValueOnce({
      held: [{ name: 'sf-manager.refresh', mode: 'shared' }],
      pending: [{ name: 'sf-manager.refresh', mode: 'shared' }],
    });
    const fetchMock = respond(unauthorized(), ok({ id: '1' }), ok({ data: 'ok' }));

    await expect(apiFetch('/users')).resolves.toEqual({ data: 'ok' });
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
  });

  it('does not check the lock for a 401 from an earlier session', async () => {
    const locks = installFakeLocks();
    const fetchMock = vi.fn(() => {
      advanceSessionEpoch();
      return Promise.resolve(unauthorized());
    });
    vi.stubGlobal('fetch', fetchMock);

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(401);
    expect(locks.query).not.toHaveBeenCalled();
    expect(urls(fetchMock)).toEqual(['/users']);
  });

  it('does not wait for a lock with another name', async () => {
    const locks = installFakeLocks();
    locks.query.mockResolvedValueOnce({
      held: [{ name: 'some-other-lock', mode: 'exclusive' }],
      pending: [{ name: 'some-other-lock', mode: 'exclusive' }],
    });
    const fetchMock = respond(unauthorized(), ok({ id: '1' }), ok({ data: 'ok' }));

    await expect(apiFetch('/users')).resolves.toEqual({ data: 'ok' });
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
  });

  it('refreshes after waiting when the retry with the other tab cookies still gets 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const locks = installFakeLocks();
    const releaseOtherTab = locks.holdByOtherTab();
    const fetchMock = respond(unauthorized(), unauthorized(), ok({ id: '1' }), ok({ data: 'ok' }));

    const pending = apiFetch<{ data: string }>('/users');
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseOtherTab();

    await expect(pending).resolves.toEqual({ data: 'ok' });
    expect(urls(fetchMock)).toEqual(['/users', '/users', '/auth/refresh', '/users']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ends the session when, after waiting, the retry and its own refresh are refused', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const locks = installFakeLocks();
    const releaseOtherTab = locks.holdByOtherTab();
    const fetchMock = respond(unauthorized(), unauthorized(), unauthorized());

    const pending = apiFetch('/users').catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseOtherTab();
    const error = await pending;

    expect((error as ApiError).status).toBe(401);
    expect(urls(fetchMock)).toEqual(['/users', '/users', '/auth/refresh']);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('neither retries nor ends the session when the session changed while waiting for another tab', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const locks = installFakeLocks();
    const releaseOtherTab = locks.holdByOtherTab();
    const fetchMock = respond(unauthorized());

    const pending = apiFetch('/users').catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 0));
    advanceSessionEpoch();
    releaseOtherTab();
    const error = await pending;

    expect((error as ApiError).status).toBe(401);
    expect(urls(fetchMock)).toEqual(['/users']);
    expect(handler).not.toHaveBeenCalled();
  });

  // Calls in one tab share its own refresh instead of waiting on its lock:
  // a refusal ends both, without a second refresh or a retry.
  it('joins its own tab refresh in flight instead of waiting for the lock', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    installFakeLocks();
    let answerRefresh: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn((url: string) =>
      url.endsWith('/auth/refresh')
        ? new Promise<Response>((resolve) => (answerRefresh = resolve))
        : Promise.resolve(unauthorized()),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = apiFetch('/users').catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = apiFetch('/users').catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 0));
    answerRefresh(unauthorized());
    const errors = await Promise.all([first, second]);

    expect(errors.map((e) => (e as ApiError).status)).toEqual([401, 401]);
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
    // Each refused call reports once; AuthProvider collapses them.
    expect(handler).toHaveBeenCalledTimes(2);
  });

  // Checking whether another tab is refreshing must not take the lock itself:
  // two calls of one tab that get a 401 together, with no refresh running,
  // must not mistake each other's check for a refresh and retry for nothing.
  it('does not mistake a sibling call checking the lock for another tab refreshing', async () => {
    const locks = installFakeLocks();
    let refreshed = false;
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshed = true;
        return Promise.resolve(ok({ id: '1' }));
      }
      return Promise.resolve(refreshed ? ok({}) : unauthorized());
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([apiFetch('/users'), apiFetch('/users')]);

    expect(urls(fetchMock).filter((u) => u === '/auth/refresh')).toHaveLength(1);
    expect(urls(fetchMock).filter((u) => u === '/users')).toHaveLength(4);
    // The check only reads the lock state; the refresh is the only holder.
    expect(locks.request).toHaveBeenCalledTimes(1);
  });

  // An origin where Web Locks throw (an opaque origin, say) keeps the
  // plain refresh-and-retry.
  it('falls back to refreshing when the Web Locks check fails', async () => {
    const locks = installFakeLocks();
    locks.query.mockRejectedValueOnce(new DOMException('denied', 'SecurityError'));
    const fetchMock = respond(unauthorized(), ok({ id: '1' }), ok({ data: 'ok' }));

    await expect(apiFetch('/users')).resolves.toEqual({ data: 'ok' });
    expect(locks.query).toHaveBeenCalledTimes(1);
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
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

  // EN-142: the call belongs to the old session, so its caller gets the 401
  // the spec names, not the refresh's own failure.
  it('rejects with the 401 when the session changed during a refresh that answered 5xx', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockImplementationOnce(() => {
        advanceSessionEpoch();
        return Promise.resolve(mockResponse({ ok: false, status: 503 }));
      });
    vi.stubGlobal('fetch', fetchMock);

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh']);
  });

  it('rejects with the 401 when the session changed during a refresh the network failed', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockImplementationOnce(() => {
        advanceSessionEpoch();
        return Promise.reject(new TypeError('Failed to fetch'));
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/auth/refresh']);
  });

  // Unchanged: with the same session, an unavailable refresh still fails the
  // call with its own error and does not end the session.
  it('still rejects with the refresh error when the session did not change', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = respond(unauthorized(), mockResponse({ ok: false, status: 503 }));

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh']);
  });
});

describe('settleRefresh (TD-5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Logout waits for a refresh in flight, so a refresh committed just before
  // the logout cannot set a fresh access cookie after it.
  it('resolves only once the refresh in flight has settled, whatever its outcome', async () => {
    let answer: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    const refreshing = refreshSession();
    let settled = false;
    const waiting = settleRefresh().then(() => {
      settled = true;
    });

    // A full macrotask, not a single microtask, before asserting it waits.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    answer(mockResponse({ ok: false, status: 401 }));
    await waiting;

    expect(settled).toBe(true);
    await expect(refreshing).resolves.toBeNull();
    await expect(settleRefresh()).resolves.toBeUndefined();
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

  it('rejects with ApiError when the refresh is unavailable (5xx), rather than reporting a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 503 })));

    const error = await refreshSession().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
  });
});
