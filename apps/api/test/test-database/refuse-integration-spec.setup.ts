import { isIntegrationSpecPath } from '../../src/shared/testing/test-database';

// hermetic-integration-tests design.md Decision 3: the unit config gains
// this tripwire in `setupFilesAfterEnv`, so a stray
// `npx jest x.integration.spec.ts` run (bypassing `test:integration`, and
// therefore the harness's `globalSetup`/target guard entirely) fails fast
// instead of silently running an integration spec against whatever
// `DATABASE_URL` the unit run happens to have. Thin glue, untested — the
// path predicate itself (`isIntegrationSpecPath`) is unit-tested in
// src/shared/testing.
const testPath = expect.getState().testPath;
if (testPath && isIntegrationSpecPath(testPath)) {
  throw new Error(
    `Refusing to run integration spec "${testPath}" under the unit test ` +
      'config. Use `npm run test:integration` instead.',
  );
}
