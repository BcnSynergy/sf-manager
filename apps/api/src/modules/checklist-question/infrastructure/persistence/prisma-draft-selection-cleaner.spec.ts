import type { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaDraftSelectionCleaner } from './prisma-draft-selection-cleaner';

// Unit test against a mocked PrismaService (not integration) — mirrors the
// mock/assertion-ratio discipline (strict-tdd.md): a single `$executeRaw`
// mock, asserting the tagged-template SQL and bound parameter are exactly
// what design.md Decision 6's `array_remove` statement requires. This class
// is a ~12-line raw-SQL probe, the exact analogue of
// `PrismaInspectableElementCounter` — no repository, no read path, nothing
// that needs a real Postgres connection to prove correct.
type ExecuteRawMock = jest.Mock<
  Promise<number>,
  [TemplateStringsArray, ...unknown[]]
>;

describe('PrismaDraftSelectionCleaner', () => {
  const makePrismaMock = (): { $executeRaw: ExecuteRawMock } => ({
    $executeRaw: jest.fn().mockResolvedValue(1) as ExecuteRawMock,
  });

  it('runs an UPDATE with array_remove against ReviewTemplate, scoped to draft rows', async () => {
    const prisma = makePrismaMock();
    const cleaner = new PrismaDraftSelectionCleaner(
      prisma as unknown as PrismaService,
    );

    await cleaner.removeQuestionFromDrafts('question-1');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prisma.$executeRaw.mock.calls[0];
    const sql = strings.join('');
    expect(sql).toContain('UPDATE "ReviewTemplate"');
    expect(sql).toContain('array_remove("draftQuestionIds"');
    expect(sql).toContain(`"status" = 'draft'`);
    // Two interpolations: array_remove(..., $1) and ...$2 = ANY(...) — both
    // bind the same questionId.
    expect(values).toEqual(['question-1', 'question-1']);
  });

  // Triangulation: a different questionId proves the values are bound from
  // the argument, not hardcoded from the first test.
  it('binds the given questionId as every raw SQL parameter', async () => {
    const prisma = makePrismaMock();
    const cleaner = new PrismaDraftSelectionCleaner(
      prisma as unknown as PrismaService,
    );

    await cleaner.removeQuestionFromDrafts('question-2');

    const [, ...values] = prisma.$executeRaw.mock.calls[0];
    expect(values).toEqual(['question-2', 'question-2']);
  });
});
