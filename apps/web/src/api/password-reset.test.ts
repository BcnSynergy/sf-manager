import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmPasswordReset, requestPasswordReset } from './password-reset';

function stubFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function firstCall(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init };
}

describe('password reset api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the email and locale to the request endpoint', async () => {
    const fetchMock = stubFetch(202);

    await requestPasswordReset('a@example.com', 'ca');

    const { url, init } = firstCall(fetchMock);
    expect(url).toMatch(/\/auth\/password-reset\/request$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@example.com', locale: 'ca' });
  });

  it('posts the token and password to the confirm endpoint and resolves on 204', async () => {
    const fetchMock = stubFetch(204);

    await expect(confirmPasswordReset('tok', 'abcdefghi1')).resolves.toBeUndefined();

    const { url, init } = firstCall(fetchMock);
    expect(url).toMatch(/\/auth\/password-reset\/confirm$/);
    expect(JSON.parse(String(init.body))).toEqual({ token: 'tok', password: 'abcdefghi1' });
  });

  it('rejects with the status and code of an error answer', async () => {
    stubFetch(400, { code: 'INVALID_RESET_TOKEN' });

    await expect(confirmPasswordReset('tok', 'abcdefghi1')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_RESET_TOKEN',
    });
  });
});
