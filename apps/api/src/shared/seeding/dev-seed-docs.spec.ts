import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { DEV_DATASET, DEV_SEED_PASSWORD } from './dev-dataset';

// dev-seed-data spec "Local Environment Declares Development" and "Shared
// Dev Password": the untracked apps/api/.env cannot be inspected, so the
// tracked example file and the README are what tell a developer how to turn
// the seed on and which accounts it creates. Paths are resolved from
// __dirname because Jest's rootDir is `src`, not the repo root.
const ENV_EXAMPLE = path.resolve(__dirname, '../../../.env.example');
const README = path.resolve(__dirname, '../../../../../README.md');

describe('dev seed documentation', () => {
  it('.env.example declares NODE_ENV=development', () => {
    expect(readFileSync(ENV_EXAMPLE, 'utf8')).toMatch(
      /^NODE_ENV=development$/m,
    );
  });

  it('.env.example lists the other env vars the api reads, with placeholders only', () => {
    const example = readFileSync(ENV_EXAMPLE, 'utf8');

    for (const key of [
      'DATABASE_URL',
      'JWT_SECRET',
      'CORS_ORIGIN',
      'SEED_ADMIN_EMAIL',
      'SEED_ADMIN_PASSWORD',
    ]) {
      expect(example).toMatch(new RegExp(`^${key}=`, 'm'));
    }
  });

  it('README documents every seeded account email', () => {
    const readme = readFileSync(README, 'utf8');

    for (const user of DEV_DATASET.users) {
      expect(readme).toContain(user.email);
    }
  });

  it('README documents the shared dev password', () => {
    expect(readFileSync(README, 'utf8')).toContain(DEV_SEED_PASSWORD);
  });

  it('README tells the developer to set NODE_ENV=development', () => {
    expect(readFileSync(README, 'utf8')).toContain('NODE_ENV=development');
  });
  it('README describes the seeded communities and the reset then seed flow', () => {
    const readme = readFileSync(README, 'utf8');

    for (const community of DEV_DATASET.communities) {
      expect(readme).toContain(community.name);
    }
    expect(readme).toContain(DEV_DATASET.template.name);
    expect(readme).toMatch(/migrate reset[\s\S]*db seed/);
  });
});
