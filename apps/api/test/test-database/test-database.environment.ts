import NodeEnvironment from 'jest-environment-node';
import { assertWorkerDatabase } from '../../src/shared/testing/test-database';

// hermetic-integration-tests design.md Decision 1 / Decision 3: a
// defense-in-depth check that runs in the worker's own sandbox, once at
// `setup()` (before any `setupFilesAfterEnv` file or spec import) and again
// at `run_start` (after the spec import, before any hook) — re-checking
// `this.global.process.env` both times, not the outer Node `process.env` of
// the environment instance, because a spec's own `dotenv/config` import
// mutates only the sandbox copy (E2/E10). Thin glue, untested — the guard
// decision itself (`assertWorkerDatabase`) is unit-tested in
// src/shared/testing.
export default class TestDatabaseEnvironment extends NodeEnvironment {
  async setup(): Promise<void> {
    await super.setup();
    assertWorkerDatabase(this.global.process.env);
  }

  handleTestEvent(event: { name: string }): void {
    if (event.name === 'run_start') {
      assertWorkerDatabase(this.global.process.env);
    }
  }
}
