import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: the datasource connection URL used by the CLI (migrate, db push,
// studio, ...) now lives here instead of in schema.prisma. Runtime
// connections in application code go through a driver adapter instead — see
// apps/api/src/shared/infrastructure/persistence/prisma.service.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Development runs prisma/seed.ts through ts-node. The production image
    // ships no ts-node (EN-93): it compiles the seed to JavaScript
    // (tsconfig.seed.json) and points PRISMA_SEED_COMMAND at that file.
    seed: process.env.PRISMA_SEED_COMMAND || 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
