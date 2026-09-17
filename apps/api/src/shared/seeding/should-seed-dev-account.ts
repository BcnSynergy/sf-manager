import { isProduction } from '../infrastructure/env/is-production';

// nav-menu verify-report WARNING-3: apps/api/prisma/seed.ts's technician
// dev-seed account uses hardcoded, publicly-visible credentials, so it MUST
// NOT be created in production. Delegates to the shared `isProduction`
// predicate (also used by auth.config.ts for prod-only cookie settings)
// instead of inlining its own `NODE_ENV === 'production'` check.
export function shouldSeedDevAccount(nodeEnv: string | undefined): boolean {
  return !isProduction(nodeEnv);
}
