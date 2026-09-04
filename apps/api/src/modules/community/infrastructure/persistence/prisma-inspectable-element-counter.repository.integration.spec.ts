import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { ELEMENT_CODE_ALPHABET } from '../../../inspectable-element/domain/element-code';
import { PrismaInspectableElementCounter } from './prisma-inspectable-element-counter.repository';

const idGenerator = new UuidV7IdGenerator();

// label-printing/design.md Decision 2: every `code` in the table must match
// the alphabet regex (inspectable-element-migration.integration.spec.ts's
// table-wide guard).
const uniqueElementCode = (): string => {
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += ELEMENT_CODE_ALPHABET[randomInt(0, ELEMENT_CODE_ALPHABET.length)];
  }
  return code;
};

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring
// prisma-maintenance-company-lookup.repository.integration.spec.ts. Talks to
// `prisma.inspectableElement` directly (not through
// InspectableElementRepository, which does not exist until Phase 6) — this
// adapter is a read-only count probe owned entirely by `community`
// (design.md Decision 4).
describe('PrismaInspectableElementCounter (integration)', () => {
  let prisma: PrismaService;
  let counter: PrismaInspectableElementCounter;
  let communityId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    counter = new PrismaInspectableElementCounter(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    communityId = idGenerator.generate();
    await prisma.community.create({
      data: {
        id: communityId,
        name: `Counter Test Community ${randomUUID()}`,
        address: '1 Test St',
        locale: 'en',
        deletedAt: null,
      },
    });
  });

  // label-printing: `code` is NOT NULL + UNIQUE (migration
  // 20260904090000_add_inspectable_element_code). PR3 dropped the PR1
  // transitional DB default (design.md Decision 4a, migration
  // 20260904150000_drop_inspectable_element_code_bridge) once the real
  // application-level generator was wired — this fixture now supplies an
  // explicit, distinct literal per call instead of relying on any default.
  const createElement = (overrides: { deletedAt?: Date | null } = {}) =>
    prisma.inspectableElement.create({
      data: {
        id: idGenerator.generate(),
        communityId,
        elementType: 'EXTINGUISHER',
        name: 'Extinguisher',
        location: 'Ground floor',
        installedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: overrides.deletedAt ?? null,
        code: uniqueElementCode(),
      },
    });

  it('returns 0 for a community with no elements attached', async () => {
    await expect(counter.countActiveByCommunity(communityId)).resolves.toBe(0);
  });

  it('counts only non-soft-deleted elements', async () => {
    await createElement();
    await createElement();
    await createElement({ deletedAt: new Date() });

    await expect(counter.countActiveByCommunity(communityId)).resolves.toBe(2);
  });

  it('does not count elements attached to a different community', async () => {
    await createElement();
    await expect(
      counter.countActiveByCommunity(idGenerator.generate()),
    ).resolves.toBe(0);
  });
});
