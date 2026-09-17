import { vi } from 'vitest';

// Shared `/auth/me` + `/auth/logout` fetch stub previously duplicated,
// almost identically, between AppLayout.test.tsx and
// AppLayout.review-sessions-collision.test.tsx (code-review finding, second
// round). Both tests need `role`; only AppLayout.test.tsx needs
// `authFails`/`logoutRejects`, so the full shape lives here and callers pass
// only what they need.
export function mockAuthFetch(
  options: { role?: string; authFails?: boolean; logoutRejects?: boolean } = {},
) {
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      return options.authFails
        ? Promise.resolve({ ok: false } as Response)
        : Promise.resolve({
            ok: true,
            json: async () => ({
              id: '1',
              email: 'user@sf-manager.example',
              role: options.role ?? 'SYSTEM_ADMIN',
            }),
          } as Response);
    }
    if (href.includes('/auth/logout')) {
      return options.logoutRejects
        ? Promise.reject(new Error('network error'))
        : Promise.resolve({ ok: true } as Response);
    }
    return Promise.resolve({ ok: true } as Response);
  });
}
