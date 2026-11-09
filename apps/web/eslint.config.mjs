import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    // react-router 8: a DOM app takes RouterProvider from `react-router/dom`,
    // which wires in ReactDOM.flushSync. Both entry points render the same in
    // jsdom, so no test can tell them apart; this rule pins the import.
    // Tests that build a memory router keep importing from `react-router`.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-router',
              importNames: ['RouterProvider'],
              message: "Import RouterProvider from 'react-router/dom' in app code.",
            },
          ],
        },
      ],
    },
  },
);
