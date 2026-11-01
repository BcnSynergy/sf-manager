import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { AuthConfig } from '../../infrastructure/config/auth.config';
import { SameOriginGuard } from './same-origin.guard';

// TD-5 S7: the refresh endpoint acts on a cookie alone, so a cross-site page
// must not be able to trigger it (CSRF). Browsers send Origin on POST.
describe('SameOriginGuard', () => {
  const guard = new SameOriginGuard({
    corsOrigin: 'https://app.sf-manager.example',
  } as AuthConfig);

  function contextWithOrigin(origin: string | undefined): ExecutionContext {
    const headers = origin === undefined ? {} : { origin };
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  it('lets a request from the web app origin through', () => {
    expect(
      guard.canActivate(contextWithOrigin('https://app.sf-manager.example')),
    ).toBe(true);
  });

  it('lets a request without an Origin header through (not a browser cross-site call)', () => {
    expect(guard.canActivate(contextWithOrigin(undefined))).toBe(true);
  });

  it.each([
    'https://evil.example',
    'https://app.sf-manager.example.evil.example',
    'null',
  ])('refuses a request from another origin (%s) with 403', (origin) => {
    expect(() => guard.canActivate(contextWithOrigin(origin))).toThrow(
      ForbiddenException,
    );
  });
});
