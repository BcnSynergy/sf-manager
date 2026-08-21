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
    // prisma/seed.ts is created in PR 3 (auth-minimal-skeleton), once the
    // `PASSWORD_HASHER`/`USER_REPOSITORY` DI tokens it resolves exist —
    // wiring the command here now so PR 3 only has to add the file.
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
