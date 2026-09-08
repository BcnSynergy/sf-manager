// The only place in the web app that parses an error response body
// (design.md "Technical Approach") — every typed call in api/users.ts goes
// through this seam so the "no English-message string comparison" success
// criterion is auditable rather than aspirational.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
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

// Callers type the success shape via T (e.g. UserResponseDto[]); a 204
// response resolves to undefined regardless of T (design.md Interfaces).
export async function apiFetch<T = undefined>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: init.body
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init.headers,
    });
  } catch {
    // Network failure (offline, DNS, CORS, aborted, ...) never reaches an
    // HTTP status — status 0 is the client-only sentinel for that.
    throw new ApiError(0);
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
