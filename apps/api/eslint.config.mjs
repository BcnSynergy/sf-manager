// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  // ADR-013: Prisma is an infrastructure-layer concern only. PrismaClient (and
  // its generated types) must never leak into domain/application/presentation
  // code — only into infrastructure/persistence/** repository implementations.
  {
    files: ['src/**/*.ts'],
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
  {
    files: ['src/**/infrastructure/persistence/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
