// nav-menu verify-report WARNING-3: apps/api/prisma/seed.ts's technician
// dev-seed account uses hardcoded, publicly-visible credentials, so it MUST
// NOT be created in production — mirrors the same
// `process.env.NODE_ENV === 'production'` gate already used by
// auth.config.ts (apps/api/src/modules/auth/infrastructure/config/
// auth.config.ts) for prod-only cookie settings.
export function shouldSeedDevAccount(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}
