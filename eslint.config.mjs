// Root ESLint flat config shared across the monorepo.
// Per-app configs extend/import this and add their own framework-specific rules.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**'],
  },
  // ADR-013: Prisma is an infrastructure-layer concern only. PrismaClient (and its
  // generated types) must never leak into domain/application/presentation code.
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'ADR-013: @prisma/client may only be imported inside infrastructure/persistence/** repository implementations, never in domain/application/presentation layers.',
            },
          ],
        },
      ],
    },
  },
  // The one place @prisma/client is allowed — this override must come after the
  // restriction above so it takes precedence for files under this path.
  {
    files: ['apps/api/src/**/infrastructure/persistence/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  }
);
