import { UploadOrganizationLogoUseCase } from '../../modules/organization-profile/application/use-cases/upload-organization-logo.use-case';
import type { DemoDataset } from './demo-dataset';
import {
  resolveDevSeedDeps,
  seedDevDataset,
  type DevSeedDeps,
} from './seed-dev-dataset';

type Log = (line: string) => void;

// demo-seed-data: the demo dataset goes through the dev seed's engine (the
// real use cases), plus the organization logo.
export interface DemoSeedDeps extends DevSeedDeps {
  uploadLogo: { execute(content: Buffer): Promise<unknown> };
}

export function resolveDemoSeedDeps(ctx: {
  get<T>(token: unknown): T;
}): DemoSeedDeps {
  return {
    ...resolveDevSeedDeps(ctx),
    uploadLogo: ctx.get(UploadOrganizationLogoUseCase),
  };
}

// The demo's public credentials must never reach a database by accident, so
// only the exact value `true` opens the gate: no case or whitespace
// normalization, like the dev seed's NODE_ENV allow-list. NODE_ENV plays no
// part, since the demo runs as production.
export function shouldSeedDemoData(flag: string | undefined): boolean {
  return flag === 'true';
}

export function demoSeedSkipLine(
  flag: string | undefined,
  databaseHost: string,
): string {
  const current = flag === undefined ? 'unset' : `"${flag}"`;
  return `Skipping demo seed data: SEED_DEMO_DATA is ${current}; set SEED_DEMO_DATA=true to seed it. Target database host: ${databaseHost}.`;
}

// A closed gate touches no dependency and only logs the target database host.
export async function runDemoSeed(
  flag: string | undefined,
  databaseHost: string,
  deps: DemoSeedDeps,
  data: DemoDataset,
  log: Log,
): Promise<'seeded' | 'skipped'> {
  if (!shouldSeedDemoData(flag)) {
    log(demoSeedSkipLine(flag, databaseHost));
    return 'skipped';
  }

  log(`Seeding demo data. Target database host: ${databaseHost}.`);
  await seedDemoDataset(deps, data, log);
  return 'seeded';
}

// Additive like the dev seed; the logo is uploaded on every run (an upload
// replaces the previous one).
export async function seedDemoDataset(
  deps: DemoSeedDeps,
  data: DemoDataset,
  log: Log,
): Promise<void> {
  await seedDevDataset(deps, data, log);
  await deps.uploadLogo.execute(Buffer.from(data.logoSvg, 'utf8'));
  log('Set the organization logo.');
}
