import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { stripUtf8Bom } from '../../src/shared/testing/test-database';

// hermetic-integration-tests design.md Decision 2: the base connection URL
// comes from the shell `DATABASE_URL`, or else `apps/api/.env`, parsed with
// `dotenv.parse` but never written to `process.env` — only the derived run
// URL is ever published (by global-setup.ts). Thin, untested glue: the
// BOM-stripping and shell-vs-file precedence are the only decisions here,
// and they have no branching logic worth a unit test of their own.
export function readBaseDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }
  const envPath = resolve(__dirname, '../../.env');
  if (!existsSync(envPath)) {
    return undefined;
  }
  const raw = stripUtf8Bom(readFileSync(envPath, 'utf8'));
  return parse(raw).DATABASE_URL;
}
