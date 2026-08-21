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
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
