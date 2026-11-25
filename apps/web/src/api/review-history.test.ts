import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listReviewHistory } from './review-history';

function stubFetchOnce() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [],
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedPath(fetchMock: ReturnType<typeof stubFetchOnce>): string {
  const [url] = fetchMock.mock.calls[0] as [string];
  const parsed = new URL(url, 'http://localhost');
  return `${parsed.pathname}${parsed.search}`;
}

describe('api/review-history listReviewHistory', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the whole history when no limit is given', async () => {
    const fetchMock = stubFetchOnce();

    await listReviewHistory();

    expect(requestedPath(fetchMock)).toBe('/review-history');
  });

  it('passes a limit as the query string (EN-240)', async () => {
    const fetchMock = stubFetchOnce();

    await listReviewHistory({ limit: 5 });

    expect(requestedPath(fetchMock)).toBe('/review-history?limit=5');
  });
});
