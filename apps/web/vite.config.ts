import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // @sf-manager/validation is a linked workspace package that compiles to
    // CommonJS (ADR-015, so apps/api can require() it). Vite only converts
    // CJS deps to ESM for packages it pre-bundles; linked monorepo packages
    // are served as raw source via /@fs/ otherwise, so this must be listed
    // explicitly or named imports fail in the browser with "does not
    // provide an export named ...".
    include: ['@sf-manager/validation'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
