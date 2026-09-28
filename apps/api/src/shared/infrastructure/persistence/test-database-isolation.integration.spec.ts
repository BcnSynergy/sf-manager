import 'dotenv/config';
import { PrismaService } from './prisma.service';

// hermetic-integration-tests design.md Testing Strategy: written first (RED)
// — it asserts the run database's identity, which only exists once the
// harness (globalSetup/globalTeardown/jest-integration.json) is wired up.
// Under today's config (no harness yet) this fails because there is no run
// database and `SF_TEST_RUN_DATABASE` is never published.
//
// specs/integration-test-isolation/spec.md: "Renamed health spec runs
// against its run database" and the Fail-Fast Target Guard requirement —
// `current_database()` must match the run-name pattern and equal
// `process.env.SF_TEST_RUN_DATABASE`, not merely "not sfmanager".
const RUN_DATABASE_NAME_PATTERN =
  /^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$/;

describe('Test database isolation (integration)', () => {
  it('runs against a uniquely named run database, never the dev database', async () => {
    const prisma = new PrismaService();
    await prisma.$connect();
    try {
      const rows = await prisma.$queryRawUnsafe<{ current_database: string }[]>(
        'SELECT current_database()',
      );
      const currentDatabase = rows[0]?.current_database;

      expect(currentDatabase).toBeDefined();
      expect(currentDatabase).not.toBe('sfmanager');
      expect(currentDatabase).toMatch(RUN_DATABASE_NAME_PATTERN);
      expect(currentDatabase).toBe(process.env.SF_TEST_RUN_DATABASE);
    } finally {
      await prisma.$disconnect();
    }
  });
});
