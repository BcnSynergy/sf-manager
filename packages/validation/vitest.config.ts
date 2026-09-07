import { configDefaults, defineConfig } from 'vitest/config';

// This package had no test runner configured until now (review-session PR1
// post-review fix: a boundary test for updateInspectableElementSchema's
// `deactivated` field needed somewhere to run). Node environment — pure Zod
// schema validation, no DOM involved (unlike apps/web's jsdom setup).
//
// review-session PR5 fresh-context review fix: apps/api's `pretest` runs
// `tsc` on this package (its own `pretest`/build step), which compiles
// `src/**/*.spec.ts` into `dist/**/*.spec.js` as CJS output. Vitest cannot
// import itself from a CommonJS module (`vitest cannot be imported ... using
// require()`), so those compiled specs must never be collected — extending
// (not replacing) Vitest's own `configDefaults.exclude` so we keep its other
// sensible defaults (node_modules, cypress, etc.) alongside this one.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
