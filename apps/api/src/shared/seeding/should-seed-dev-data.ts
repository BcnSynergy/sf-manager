// dev-seed-data design.md Decision 3: the dev users and the dev dataset use
// hardcoded, publicly visible credentials (the shared dev password is
// documented in README.md), so they MUST NOT be created anywhere but a
// development environment. An exact-match allow-list on NODE_ENV fails
// closed: unset, `test`, `staging`, `production` and any other value all
// skip. Deliberately no case or whitespace normalization.
export function shouldSeedDevData(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'development';
}
