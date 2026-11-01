// The only place in the web app that parses an error response body
// (design.md "Technical Approach") — every typed call in api/users.ts goes
// through this seam so the "no English-message string comparison" success
// criterion is auditable rather than aspirational.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const HTTP_NO_CONTENT = 204;

// status 0 marks a network failure or a response body that could not be
// parsed at all. `code` is present only when the server sent one —
// originally exclusively 409 responses (user-management spec delta,
// design.md Decision 3), now also several coded 400s (maintenance-company
// design.md Decision 5: MAINTENANCE_COMPANY_REQUIRED/NOT_ALLOWED/NOT_FOUND);
// every other status still leaves it undefined.
// `extra` (review-session design.md Decision 2 / spec "Complete a Session
// and Explain Its Gaps"): the first caller that needs a field off the error
// body beyond `code` — the 409 UNREVIEWED_ELEMENTS_WITHOUT_REASON body
// carries `elementCodes`. Captured generically (the parsed body minus
// `statusCode`/`error`/`message`/`code`, which every coded error already
// carries and every existing caller already ignores) rather than as a
// one-off `elementCodes`-shaped field, so a future coded error with a
// different extra payload reuses the same mechanism. `undefined` when the
// body carries nothing beyond the standard fields, so `error.extra` stays
// `falsy`-checkable exactly like `.code`.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly extra?: Record<string, unknown>;

  constructor(status: number, code?: string, extra?: Record<string, unknown>) {
    super(`API ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const STANDARD_ERROR_BODY_KEYS = new Set(['statusCode', 'error', 'message', 'code']);
const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR = 500;

// auth-live-user-check design.md D4: apiFetch is the only data-call seam, so
// a mid-session 401 (the API now re-reads the user on every request) is
// reported from here. AuthProvider registers the handler; login, logout and
// the mount-time /auth/me use raw fetch and never reach it.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

// stale-401-session-guard design.md Decision 1 (TD-25): counts session
// boundaries. apiFetch captures it when a request starts, so a 401 from a
// request issued under an earlier session cannot end the current one.
// AuthProvider advances it at login, logout and session end; only the
// relative comparison matters, so there is deliberately no reset export.
let sessionEpoch = 0;

export function advanceSessionEpoch(): void {
  sessionEpoch += 1;
}

// Callers type the success shape via T (e.g. UserResponseDto[]); a 204
// response resolves to undefined regardless of T (design.md Interfaces).
export async function apiFetch<T = undefined>(path: string, init: RequestInit = {}): Promise<T> {
  const epochAtStart = sessionEpoch;
  let response = await send(path, init);

  // TD-5 S8: the access token is short-lived. A 401 first tries one silent
  // refresh, then retries the request once; only a refused refresh ends the
  // session. An unavailable refresh rejects with its ApiError (0 or 5xx),
  // which fails this call without ending the session. A session change during the refresh (logout, another login)
  // means this request belongs to the old session: neither retried nor
  // reported.
  if (response.status === HTTP_UNAUTHORIZED && epochAtStart === sessionEpoch) {
    const refreshed = await refreshSession();
    if (refreshed !== null && epochAtStart === sessionEpoch) {
      response = await send(path, init);
    }
  }

  if (!response.ok) {
    let code: string | undefined;
    let extra: Record<string, unknown> | undefined;
    try {
      const body = (await response.json()) as Record<string, unknown>;
      code = typeof body?.code === 'string' ? body.code : undefined;
      const extraEntries = Object.entries(body ?? {}).filter(
        ([key]) => !STANDARD_ERROR_BODY_KEYS.has(key),
      );
      extra = extraEntries.length > 0 ? Object.fromEntries(extraEntries) : undefined;
    } catch {
      // Empty or non-JSON error body — ApiError still carries the real
      // HTTP status, just without a discriminator code.
    }
    // A stale 401 (epoch advanced since the request started) skips the
    // handler but the caller still gets ApiError(401) (Decision 4).
    if (response.status === HTTP_UNAUTHORIZED && epochAtStart === sessionEpoch) {
      unauthorizedHandler?.();
    }
    throw new ApiError(response.status, code, extra);
  }

  if (response.status === HTTP_NO_CONTENT) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(0);
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers:
        init.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json', ...init.headers }
          : init.headers,
    });
  } catch {
    throw new ApiError(0);
  }
}

// TD-5 S8: one refresh at a time. Within a tab, concurrent callers share the
// one in flight; across tabs, a Web Lock serializes them, so the second tab
// sends the cookie the first one just received instead of the spent one.
const REFRESH_LOCK = 'sf-manager.refresh';
let refreshInFlight: Promise<unknown> | null = null;

// Exchanges the refresh cookie for a new session. Resolves with the user
// the API answers with, or null when the API refuses the refresh (4xx: the
// session is over). Rejects with ApiError when the refresh is unavailable
// (network down, 5xx): the session may still be valid, so callers must not
// end it.
export function refreshSession<T = unknown>(): Promise<T | null> {
  refreshInFlight ??= withRefreshLock(postRefresh).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight as Promise<T | null>;
}

function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks ? locks.request(REFRESH_LOCK, work) : work();
}

async function postRefresh(): Promise<unknown> {
  // A response lost to the network may have consumed the token server-side:
  // retry once at once, inside the API's grace window, where that consumed
  // token is still honoured once.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      continue;
    }
    if (response.status >= HTTP_SERVER_ERROR) {
      throw new ApiError(response.status);
    }
    if (!response.ok) {
      return null;
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }
  throw new ApiError(0);
}
