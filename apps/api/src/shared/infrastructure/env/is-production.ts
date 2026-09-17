// nav-menu verify-report (second review round): auth.config.ts and
// should-seed-dev-account.ts each independently inlined
// `process.env.NODE_ENV === 'production'`. This is the single shared
// predicate both call sites use instead.
export function isProduction(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}
