// Shared Zod schemas (ADR-015), the single source of truth for validation on
// both the NestJS backend and every frontend client.
//
// PR 4 (auth-minimal-skeleton): compiled to CommonJS (tsconfig.json,
// package.json's "main"/"types" -> dist/) instead of shipped as raw "type":
// "module" TypeScript source. AuthController is the first real consumer of
// this package reached through apps/api's actual Node runtime (nest build /
// node dist/main.js / prisma db seed) rather than only through Jest's
// ts-jest transform pipeline (which silently bypassed module-format
// mismatches) — a source-only ESM package cannot be `require()`d by
// apps/api's CommonJS output at all, regardless of file existence. Vite
// (apps/web, PR 5) consumes compiled CommonJS just as easily as ESM, so
// unifying on CJS here avoids a dual ESM/CJS conditional-exports setup for
// a single small schema file.
export * from './auth/login.schema';
export * from './users/password.schema';
export * from './users/create-user.schema';
export * from './users/update-user.schema';
