import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { listReviewSchedule, type ReviewScheduleRow } from './review-schedule';

// Mirrors the GET /review-schedule contract (review-schedule design.md
// Decision 9): no parameters, flat rows in the server's order.

function mockResponse(init: { ok: boolean; status: number; json?: () => Promise<unknown> }): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: init.json ?? (async () => ({})),
  } as unknown as Response;
}

function stubFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const rows: ReviewScheduleRow[] = [
  {
    communityId: 'c1',
    communityName: 'Sunset Towers',
    elementType: 'EXTINGUISHER',
    status: 'OVERDUE',
    reasonCode: 'QUARTER_MISSED',
    quarterYear: 2026,
    quarterNumber: 3,
    deadline: '2026-09-30',
    lastCoveringSessionDate: '2026-05-10',
  },
  {
    communityId: 'c2',
    communityName: 'Harbour View',
    elementType: 'EXTINGUISHER',
    status: 'NEVER_REVIEWED',
    reasonCode: 'NEVER_REVIEWED',
    quarterYear: null,
    quarterNumber: null,
    deadline: null,
    lastCoveringSessionDate: null,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listReviewSchedule', () => {
  it('GETs /review-schedule with no query string and returns the rows in server order', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => rows }),
    );

    await expect(listReviewSchedule()).resolves.toEqual(rows);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/review-schedule$/);
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('propagates ApiError status and code on a rejected response', async () => {
    stubFetchOnce(
      mockResponse({ ok: false, status: 403, json: async () => ({ code: 'FORBIDDEN' }) }),
    );

    await expect(listReviewSchedule()).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('propagates status 0 on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    const error = await listReviewSchedule().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });
});
