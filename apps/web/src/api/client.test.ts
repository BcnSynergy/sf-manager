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
  // is held. A request whose `signal` aborts before it is granted rejects
  // with an AbortError and leaves the queue, as in browsers. Installed on
  // navigator.locks.
  function installFakeLocks() {
    let tail: Promise<void> = Promise.resolve();
    let held = false;
    // The tab holding the lock, as Web Locks report it (`clientId`). Requests
    // from this tab hold as 'this-tab'; holdByOtherTab() names its own.
    let holder: string | undefined;
    let otherTabs = 0;
    const request = vi.fn(
      async (
        name: string,
        optionsOrCallback:
          { mode?: 'shared' | 'exclusive'; signal?: AbortSignal; client?: string } | LockCallback,
        maybeCallback?: LockCallback,
      ) => {
        const callback = (
          typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
        ) as LockCallback;
        const signal =
          typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback.signal;
        const previous = tail;
        let release: () => void = () => undefined;
        tail = new Promise((resolve) => (release = resolve));
        if (signal) {
          try {
            await Promise.race([
              previous,
              new Promise<never>((_, reject) => {
                const abort = () => reject(new DOMException('aborted', 'AbortError'));
                if (signal.aborted) abort();
                signal.addEventListener('abort', abort, { once: true });
                void previous.then(() => signal.removeEventListener('abort', abort));
              }),
            ]);
          } catch (error) {
            // Leave the queue: the next request waits only for the one before.
            void previous.then(release);
            throw error;
          }
        } else {
          await previous;
        }
        held = true;
        holder =
          (typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback.client) ??
          'this-tab';
        try {
          return await callback({ name });
        } finally {
          held = false;
          holder = undefined;
          release();
        }
      },
    );
    type LockInfo = { name: string; mode: string; clientId?: string };
    const query = vi.fn(async (): Promise<{ held: LockInfo[]; pending: LockInfo[] }> => ({
      held: held ? [{ name: 'sf-manager.refresh', mode: 'exclusive', clientId: holder }] : [],
      pending: [],
    }));
    vi.stubGlobal('navigator', { ...navigator, locks: { request, query } });
    return {
      request,
      query,
      isHeld: () => held,
      // Another tab takes the lock (queued behind any holder) and keeps it
      // until the returned function runs. Each call is a different tab.
      holdByOtherTab(): () => void {
        let releaseOtherTab: () => void = () => undefined;
        otherTabs += 1;
        void request(
          'sf-manager.refresh',
          { client: `other-tab-${otherTabs}` },
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
    // Exclusive (no mode), with a signal that gives up a lock not granted in time.
    expect(locks.request).toHaveBeenCalledWith(
      'sf-manager.refresh',
      { signal: expect.any(AbortSignal) as AbortSignal },
      expect.any(Function),
    );
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

  // EN-142: another tab's refresh may have rotated the token just before the
  // logout; its fresh access cookie (a jti the logout does not know) must land
  // first, even when no call in this tab is waiting for it.
  it('makes settleRefresh wait for another tab refresh that no call here waits for', async () => {
    const locks = installFakeLocks();
    const releaseOtherTab = locks.holdByOtherTab();
    // The fake grants the other tab's lock a tick later.
    await new Promise((resolve) => setTimeout(resolve, 0));

    let settled = false;
    const waiting = settleRefresh().then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    releaseOtherTab();
    await waiting;
    expect(settled).toBe(true);
  });

  // EN-174: a tab frozen while holding the lock must not leave this tab's
  // refresh queued forever: login and logout wait for it (settleRefresh).
  // EN-177: several tabs refreshing in turn can keep a refresh queued for
  // longer than 9 s without any of them being frozen; only a tab holding
  // the lock for 9 s without letting go is.
  it('keeps waiting while the lock passes from tab to tab, beyond 9 seconds in total', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseFirst = locks.holdByOtherTab();
      const releaseSecond = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      const fetchMock = vi.fn(() => Promise.resolve(ok({ id: '1' })));
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession();
      await vi.advanceTimersByTimeAsync(6_000);
      releaseFirst();
      await vi.advanceTimersByTimeAsync(5_999);
      expect(fetchMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      releaseSecond();
      await vi.advanceTimersByTimeAsync(0);

      await expect(refreshing).resolves.toEqual({ id: '1' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // The wait for another tab's refresh (retrying with its cookies) keeps its
  // fixed 9 s cap even while the lock passes on: after it the call refreshes
  // itself, and that refresh follows the queue.
  it('stops waiting for another tab after 9 seconds even while the lock passes on, then refreshes', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseFirst = locks.holdByOtherTab();
      const releaseSecond = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      const fetchMock = respond(unauthorized(), ok({ id: '1' }), ok({ data: 'ok' }));

      const call = apiFetch<{ data: string }>('/users');
      await vi.advanceTimersByTimeAsync(6_000);
      releaseFirst();
      await vi.advanceTimersByTimeAsync(3_000);
      // 9 s: the shared wait gave up; the call's own refresh is now queued.
      expect(urls(fetchMock)).toEqual(['/users']);
      await vi.advanceTimersByTimeAsync(3_000);
      releaseSecond();
      await vi.advanceTimersByTimeAsync(0);

      await expect(call).resolves.toEqual({ data: 'ok' });
      expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh', '/users']);
    } finally {
      vi.useRealTimers();
    }
  });

  // A check that finds nobody holding the lock (it is passing between tabs)
  // counts as the queue moving, not as a frozen tab.
  it('keeps waiting when a check finds the lock between two holders', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseOther = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      const fetchMock = vi.fn(() => Promise.resolve(ok({ id: '1' })));
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession();
      await vi.advanceTimersByTimeAsync(0);
      locks.query.mockResolvedValueOnce({ held: [], pending: [] });
      await vi.advanceTimersByTimeAsync(9_000);
      expect(fetchMock).not.toHaveBeenCalled();
      releaseOther();
      await vi.advanceTimersByTimeAsync(0);

      await expect(refreshing).resolves.toEqual({ id: '1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still abandons a refresh when a check finds no holder and then a tab freezes with the lock', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseFirst = locks.holdByOtherTab();
      const releaseFrozen = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(0);
      locks.query.mockResolvedValueOnce({ held: [], pending: [] });
      await vi.advanceTimersByTimeAsync(9_000);
      // The first tab lets go; the second takes the lock and freezes.
      releaseFirst();
      await vi.advanceTimersByTimeAsync(18_000);
      const error = await refreshing;

      expect((error as ApiError).status).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      releaseFrozen();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('abandons a refresh when two checks in a row find no holder', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseOther = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(0);
      locks.query.mockResolvedValue({ held: [], pending: [] });
      let settled = false;
      void refreshing.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(17_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const error = await refreshing;

      expect((error as ApiError).status).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      releaseOther();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // EN-179: a lock held only in shared mode (other tabs' short waits) is
  // followed by the lowest shared clientId, like a moving queue.
  describe('a lock held in shared mode', () => {
    const shared = (...clientIds: string[]) => ({
      held: clientIds.map((clientId) => ({ name: 'sf-manager.refresh', mode: 'shared', clientId })),
      pending: [],
    });

    it('keeps waiting while the shared holders change', async () => {
      vi.useFakeTimers();
      try {
        const locks = installFakeLocks();
        const releaseOther = locks.holdByOtherTab();
        await vi.advanceTimersByTimeAsync(0);
        locks.query
          .mockResolvedValueOnce(shared('tab-a'))
          .mockResolvedValueOnce(shared('tab-b'))
          .mockResolvedValueOnce(shared('tab-c'));
        const fetchMock = vi.fn(() => Promise.resolve(ok({ id: '1' })));
        vi.stubGlobal('fetch', fetchMock);

        const refreshing = refreshSession();
        await vi.advanceTimersByTimeAsync(18_000);
        expect(fetchMock).not.toHaveBeenCalled();
        // Start sample, then the checks at 9 s and 18 s.
        expect(locks.query).toHaveBeenCalledTimes(3);
        releaseOther();
        await vi.advanceTimersByTimeAsync(0);

        await expect(refreshing).resolves.toEqual({ id: '1' });
      } finally {
        vi.useRealTimers();
      }
    });

    // The lowest id decides: {a, b} then {a, c} is the same holder (a).
    it('compares shared holders by their lowest client id', async () => {
      vi.useFakeTimers();
      try {
        const locks = installFakeLocks();
        const releaseOther = locks.holdByOtherTab();
        await vi.advanceTimersByTimeAsync(0);
        locks.query
          .mockResolvedValueOnce(shared('tab-a', 'tab-b'))
          .mockResolvedValueOnce(shared('tab-a', 'tab-c'));
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const refreshing = refreshSession().catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(9_000);
        const error = await refreshing;

        expect((error as ApiError).status).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
        releaseOther();
        await vi.advanceTimersByTimeAsync(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('gives up when the same shared holder is seen at two checks, whatever order they are listed in', async () => {
      vi.useFakeTimers();
      try {
        const locks = installFakeLocks();
        const releaseOther = locks.holdByOtherTab();
        await vi.advanceTimersByTimeAsync(0);
        locks.query
          .mockResolvedValueOnce(shared('tab-b', 'tab-a'))
          .mockResolvedValueOnce(shared('tab-a', 'tab-b'));
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const refreshing = refreshSession().catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(9_000);
        const error = await refreshing;

        expect((error as ApiError).status).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
        releaseOther();
        await vi.advanceTimersByTimeAsync(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('abandons a refresh after 9 seconds when the lock query fails', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseOther = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      locks.query.mockRejectedValue(new DOMException('denied', 'SecurityError'));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(9_000);
      const error = await refreshing;

      expect((error as ApiError).status).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      releaseOther();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // A query() that never answers must not keep a refresh queued behind a
  // frozen tab forever: it counts as "cannot tell" after a second.
  it('abandons a refresh behind a frozen tab even when the lock query hangs', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseFrozen = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      locks.query.mockImplementation(() => new Promise(() => undefined));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      const error = await refreshing;

      expect((error as ApiError).status).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      releaseFrozen();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after 9 seconds when the browser does not say which tab holds the lock', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseFirst = locks.holdByOtherTab();
      const releaseSecond = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      locks.query.mockResolvedValue({
        held: [{ name: 'sf-manager.refresh', mode: 'exclusive' }],
        pending: [],
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession().catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(6_000);
      releaseFirst();
      await vi.advanceTimersByTimeAsync(3_000);
      const error = await refreshing;

      expect((error as ApiError).status).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      releaseSecond();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('abandons a refresh queued behind a tab that took the lock and has held it for 9 seconds', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseFirst = locks.holdByOtherTab();
      const releaseFrozen = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession().catch((e: unknown) => e);
      let settled = false;
      void refreshing.then(() => {
        settled = true;
      });
      // The first tab lets go at 6 s; the second takes the lock and freezes.
      await vi.advanceTimersByTimeAsync(6_000);
      releaseFirst();
      await vi.advanceTimersByTimeAsync(11_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(9_000);
      const error = await refreshing;

      expect((error as ApiError).status).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      releaseFrozen();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('abandons a refresh that cannot get the lock within 9 seconds, as unavailable, without sending it', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseOtherTab = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession().catch((e: unknown) => e);
      let settled = false;
      void refreshing.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(8_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const error = await refreshing;

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      // The abandoned request left the queue: once the other tab lets go,
      // nothing of this refresh runs.
      releaseOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(locks.isHeld()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails a call behind a frozen tab as unavailable, without ending the session', async () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn();
      setUnauthorizedHandler(handler);
      const locks = installFakeLocks();
      const releaseOtherTab = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      const fetchMock = respond(unauthorized());

      const call = apiFetch('/users').catch((e: unknown) => e);
      let settled = false;
      void call.then(() => {
        settled = true;
      });
      // 9 s waiting for the other tab's refresh, then 9 s for the lock.
      await vi.advanceTimersByTimeAsync(17_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const error = await call;

      expect((error as ApiError).status).toBe(0);
      expect(urls(fetchMock)).toEqual(['/users']);
      expect(handler).not.toHaveBeenCalled();

      releaseOtherTab();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // A lock granted just before the deadline is not given up: the refresh
  // runs to completion, past 9 s from its request, under its own deadline.
  it('lets a refresh granted the lock just before 9 seconds run to completion', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseOtherTab = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      let answerRefresh: (response: Response) => void = () => undefined;
      const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (answerRefresh = resolve)));
      vi.stubGlobal('fetch', fetchMock);

      const refreshing = refreshSession();
      await vi.advanceTimersByTimeAsync(8_999);
      releaseOtherTab();
      await vi.advanceTimersByTimeAsync(4_000);
      answerRefresh(ok({ id: '1' }));

      await expect(refreshing).resolves.toEqual({ id: '1' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = locks.request.mock.calls.at(-1) as [string, { signal: AbortSignal }];
      expect(options.signal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('makes settleRefresh resolve once a refresh stuck behind a frozen tab is abandoned', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseOtherTab = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      vi.stubGlobal('fetch', vi.fn());
      const refreshing = refreshSession().catch(() => undefined);

      let settled = false;
      void settleRefresh().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(9_000);

      expect(settled).toBe(true);
      await refreshing;
      releaseOtherTab();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds the wait for another tab refresh no call here waits for at 9 seconds', async () => {
    vi.useFakeTimers();
    try {
      const locks = installFakeLocks();
      const releaseOtherTab = locks.holdByOtherTab();
      await vi.advanceTimersByTimeAsync(0);
      let settled = false;
      void settleRefresh().then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(8_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);

      releaseOtherTab();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not make settleRefresh wait when no tab is refreshing', async () => {
    const locks = installFakeLocks();
    locks.query.mockResolvedValueOnce({
      held: [{ name: 'sf-manager.refresh', mode: 'shared' }],
      pending: [{ name: 'some-other-lock', mode: 'exclusive' }],
    });

    await expect(settleRefresh()).resolves.toBeUndefined();
    expect(locks.request).not.toHaveBeenCalled();
  });

  // Pins that settleRefresh absorbs a failed check (allSettled); the check's
  // own catch is pinned by "falls back to refreshing when the Web Locks check
  // fails".
  it('does not make settleRefresh fail when the Web Locks check fails', async () => {
    const locks = installFakeLocks();
    locks.query.mockRejectedValueOnce(new DOMException('denied', 'SecurityError'));

    await expect(settleRefresh()).resolves.toBeUndefined();
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
    // The failed check came first (the refresh's own lock request may query
    // the holder again, EN-177).
    await expect(locks.query.mock.results[0].value).rejects.toThrow('denied');
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

  it('rejects with the 401 when the session changed during a rate-limited refresh (429)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockImplementationOnce(() => {
        advanceSessionEpoch();
        return Promise.resolve(mockResponse({ ok: false, status: 429 }));
      });
    vi.stubGlobal('fetch', fetchMock);

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(urls(fetchMock)).toEqual(['/users', '/auth/refresh']);
  });

  // Any failure of the refresh counts, not only an ApiError: here the Web
  // Lock itself rejects, so the refresh never reaches the network.
  it('rejects with the 401 when the session changed and the refresh lock failed', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const locks = installFakeLocks();
    locks.query.mockResolvedValueOnce({ held: [], pending: [] });
    locks.request.mockImplementationOnce(async () => {
      advanceSessionEpoch();
      throw new DOMException('aborted', 'AbortError');
    });
    const fetchMock = respond(unauthorized());

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(urls(fetchMock)).toEqual(['/users']);
  });

  // Unchanged: with the same session, an unavailable refresh still fails the
  // call with its own error and does not end the session.
  it('still rejects with the refresh error when the session did not change', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const fetchMock = respond(unauthorized(), mockResponse({ ok: false, status: 503 }));

    const error = await apiFetch('/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
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
