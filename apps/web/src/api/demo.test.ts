import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDemoInfo } from './demo';

describe('demo api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the demo info from GET /demo', async () => {
    const body = {
      enabled: true,
      password: 'sf-manager-demo-1',
      accounts: [{ email: 'gestor@demo.sf-manager.example', role: 'MANAGER' }],
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => body } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDemoInfo()).resolves.toEqual(body);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toMatch(/\/demo$/);
    expect(init?.method ?? 'GET').toBe('GET');
  });
});
