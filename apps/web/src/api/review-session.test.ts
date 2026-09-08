import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getReviewScope,
  openReviewSession,
  listOwnReviewSessions,
  readReviewSession,
  discardReviewSession,
  resolveElementByCode,
  recordEntry,
  completeReviewSession,
} from './review-session';

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

function stubFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const scope = {
  communities: [{ id: 'c1', name: 'Sunset Towers' }],
  templates: [{ id: 't1', elementType: 'EXTINGUISHER', frequency: 'QUARTERLY', name: 'Q1' }],
};

const session = {
  id: 's1',
  communityId: 'c1',
  templateId: 't1',
  performedById: 'u1',
  status: 'draft' as const,
  startedAt: '2026-09-08T00:00:00.000Z',
  completedAt: null,
};

const detail = {
  ...session,
  entries: [],
  coverage: { reviewed: 0, unreviewed: 0 },
};

const resolved = {
  element: { id: 'e1', code: '23456789AB', name: 'Lobby extinguisher', location: 'Lobby' },
  questions: [{ questionId: 'q1', order: 0, text: 'Is it charged?' }],
  entry: null,
};

const entryResult = {
  inspectableElementId: 'e1',
  reviewed: true,
  observations: null,
  answers: [{ questionId: 'q1', answer: 'YES' as const }],
  recordedAt: '2026-09-08T00:00:00.000Z',
};

describe('api/review-session', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('getReviewScope() GETs /review-scope and returns the parsed scope', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => scope }),
    );

    await expect(getReviewScope()).resolves.toEqual(scope);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/review-scope');
  });

  it('openReviewSession() POSTs /review-sessions with the community and template ids', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 201, json: async () => session }),
    );

    await expect(
      openReviewSession({ communityId: 'c1', templateId: 't1' }),
    ).resolves.toEqual(session);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/review-sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ communityId: 'c1', templateId: 't1' });
  });

  it('listOwnReviewSessions() GETs /review-sessions and returns the parsed list', async () => {
    stubFetchOnce(mockResponse({ ok: true, status: 200, json: async () => [session] }));

    await expect(listOwnReviewSessions()).resolves.toEqual([session]);
  });

  it('readReviewSession() GETs /review-sessions/:id and returns the detail shape', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => detail }),
    );

    await expect(readReviewSession('s1')).resolves.toEqual(detail);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/review-sessions/s1');
  });

  it('discardReviewSession() DELETEs /review-sessions/:id and resolves to undefined', async () => {
    const fetchMock = stubFetchOnce(mockResponse({ ok: true, status: 204 }));

    await expect(discardReviewSession('s1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/review-sessions/s1');
    expect(init.method).toBe('DELETE');
  });

  it('resolveElementByCode() GETs /review-sessions/:id/elements/:code', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => resolved }),
    );

    await expect(resolveElementByCode('s1', '23456789AB')).resolves.toEqual(resolved);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/review-sessions/s1/elements/23456789AB');
  });

  it('recordEntry() PUTs /review-sessions/:id/entries/:elementId with the entry body', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({ ok: true, status: 200, json: async () => entryResult }),
    );

    await expect(
      recordEntry('s1', 'e1', { answers: [{ questionId: 'q1', value: 'YES' }] }),
    ).resolves.toEqual(entryResult);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/review-sessions/s1/entries/e1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      answers: [{ questionId: 'q1', value: 'YES' }],
    });
  });

  it('completeReviewSession() POSTs /review-sessions/:id/complete', async () => {
    const fetchMock = stubFetchOnce(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 's1', status: 'completed', completedAt: '2026-09-08T00:00:00.000Z' }),
      }),
    );

    await expect(completeReviewSession('s1')).resolves.toEqual({
      id: 's1',
      status: 'completed',
      completedAt: '2026-09-08T00:00:00.000Z',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/review-sessions/s1/complete');
    expect(init.method).toBe('POST');
  });
});
