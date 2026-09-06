import { defineConfig } from 'vitest/config';

// This package had no test runner configured until now (review-session PR1
// post-review fix: a boundary test for updateInspectableElementSchema's
// `deactivated` field needed somewhere to run). Node environment — pure Zod
// schema validation, no DOM involved (unlike apps/web's jsdom setup).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
