import { DEMO_DATASET } from './demo-dataset';
import { seedDevDataset } from './seed-dev-dataset';
import { runDemoSeed, type DemoSeedDeps } from './seed-demo-dataset';

// The engine itself is covered by seed-dev-dataset.spec.ts and the
// integration spec; here only the gate and the logo step around it.
jest.mock('./seed-dev-dataset', () => ({
  ...jest.requireActual<object>('./seed-dev-dataset'),
  seedDevDataset: jest.fn(),
}));

// Any access to a dependency fails the test: a closed gate touches nothing.
const untouchable = new Proxy({} as DemoSeedDeps, {
  get(_target, property) {
    throw new Error(`closed gate touched deps.${String(property)}`);
  },
});

describe('runDemoSeed', () => {
  beforeEach(() => {
    jest.mocked(seedDevDataset).mockReset();
  });

  it('with SEED_DEMO_DATA=true seeds the dataset, then uploads the logo', async () => {
    const uploadLogo = { execute: jest.fn() };
    const deps = { uploadLogo } as unknown as DemoSeedDeps;
    const log = jest.fn();

    const outcome = await runDemoSeed(
      'true',
      'db.example:5432',
      deps,
      DEMO_DATASET,
      log,
    );

    expect(outcome).toBe('seeded');
    expect(seedDevDataset).toHaveBeenCalledWith(deps, DEMO_DATASET, log);
    expect(uploadLogo.execute).toHaveBeenCalledWith(
      Buffer.from(DEMO_DATASET.logoSvg, 'utf8'),
    );
    expect(log.mock.calls).toEqual([
      ['Seeding demo data. Target database host: db.example:5432.'],
      ['Set the organization logo.'],
    ]);
  });

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
