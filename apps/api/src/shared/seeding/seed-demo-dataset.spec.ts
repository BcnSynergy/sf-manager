import { DEMO_DATASET } from './demo-dataset';
import { runDemoSeed, type DemoSeedDeps } from './seed-demo-dataset';

// Any access to a dependency fails the test: a closed gate touches nothing.
const untouchable = new Proxy({} as DemoSeedDeps, {
  get(_target, property) {
    throw new Error(`closed gate touched deps.${String(property)}`);
  },
});

describe('runDemoSeed', () => {
  it.each([
    [undefined, 'unset'],
    ['false', '"false"'],
    ['TRUE', '"TRUE"'],
    [' true', '" true"'],
    ['1', '"1"'],
  ])(
    'with SEED_DEMO_DATA %p skips without touching anything and says why',
    async (flag, shown) => {
      const log = jest.fn();

      const outcome = await runDemoSeed(
        flag,
        'db.example:5432',
        untouchable,
        DEMO_DATASET,
        log,
      );

      expect(outcome).toBe('skipped');
      expect(log.mock.calls).toEqual([
        [
          `Skipping demo seed data: SEED_DEMO_DATA is ${shown}; set SEED_DEMO_DATA=true to seed it. Target database host: db.example:5432.`,
        ],
      ]);
    },
  );
});
