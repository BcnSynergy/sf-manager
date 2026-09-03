import { PrismaReviewTemplateRepository } from './prisma-review-template.repository';
import type { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

// tasks.md 9.2 — design.md Decision 5's core guarantee proven at the actual
// query level (not just the use-case-mock level PR 8 already covers): the
// frozen read path (`findFrozenWithSnapshot`) MUST NEVER touch
// `checklistQuestion` — only `reviewTemplateQuestion`'s own persisted
// snapshot rows. The draft path (`findDraftWithLiveQuestions`) is the
// mirror-image assertion: it MUST resolve wording through the live pool.
function makePrismaMock() {
  return {
    reviewTemplate: { findFirst: jest.fn() },
    checklistQuestion: { findMany: jest.fn() },
    reviewTemplateQuestion: { findMany: jest.fn() },
  };
}

const TEMPLATE_ID = 'template-1';

describe('PrismaReviewTemplateRepository — read paths (design.md Decision 5)', () => {
  it('findFrozenWithSnapshot never calls checklistQuestion.findMany', async () => {
    const prisma = makePrismaMock();
    prisma.reviewTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      elementType: 'EXTINGUISHER',
      frequency: 'QUARTERLY',
      name: 'Quarterly Extinguisher Check',
      version: 1,
      status: 'active',
      createdAt: new Date(),
      deletedAt: null,
    });
    prisma.reviewTemplateQuestion.findMany.mockResolvedValue([
      { questionId: 'q1', order: 1, questionText: 'Frozen wording' },
    ]);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    const result = await repository.findFrozenWithSnapshot(TEMPLATE_ID);

    expect(prisma.checklistQuestion.findMany).not.toHaveBeenCalled();
    expect(prisma.reviewTemplateQuestion.findMany).toHaveBeenCalledWith({
      where: { templateId: TEMPLATE_ID },
      orderBy: { order: 'asc' },
    });
    expect(result?.questions).toEqual([
      { questionId: 'q1', order: 1, text: 'Frozen wording' },
    ]);
  });

  it('findFrozenWithSnapshot returns null for an unknown/non-frozen id without touching reviewTemplateQuestion', async () => {
    const prisma = makePrismaMock();
    prisma.reviewTemplate.findFirst.mockResolvedValue(null);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    const result = await repository.findFrozenWithSnapshot(TEMPLATE_ID);

    expect(result).toBeNull();
    expect(prisma.reviewTemplateQuestion.findMany).not.toHaveBeenCalled();
    expect(prisma.checklistQuestion.findMany).not.toHaveBeenCalled();
  });

  it('findDraftWithLiveQuestions resolves wording through the live checklistQuestion pool, never reviewTemplateQuestion', async () => {
    const prisma = makePrismaMock();
    prisma.reviewTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      elementType: 'EXTINGUISHER',
      frequency: 'QUARTERLY',
      name: 'Draft',
      version: null,
      status: 'draft',
      draftQuestionIds: ['q1', 'q2'],
      createdAt: new Date(),
      deletedAt: null,
    });
    prisma.checklistQuestion.findMany.mockResolvedValue([
      { id: 'q1', text: 'Live wording 1' },
      { id: 'q2', text: 'Live wording 2' },
    ]);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    const result = await repository.findDraftWithLiveQuestions(TEMPLATE_ID);

    expect(prisma.reviewTemplateQuestion.findMany).not.toHaveBeenCalled();
    expect(prisma.checklistQuestion.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['q1', 'q2'] }, deletedAt: null },
    });
    expect(result?.questions).toEqual([
      { questionId: 'q1', order: 1, text: 'Live wording 1' },
      { questionId: 'q2', order: 2, text: 'Live wording 2' },
    ]);
  });

  it('findDraftWithLiveQuestions excludes a concurrently soft-deleted question id, keeping order contiguous', async () => {
    const prisma = makePrismaMock();
    prisma.reviewTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      elementType: 'EXTINGUISHER',
      frequency: 'QUARTERLY',
      name: 'Draft',
      version: null,
      status: 'draft',
      draftQuestionIds: ['q1', 'q2', 'q3'],
      createdAt: new Date(),
      deletedAt: null,
    });
    // q2 soft-deleted concurrently — the pool query excludes it (deletedAt:
    // null), and the cleanup cascade (design.md Decision 6) has not
    // necessarily removed it from draftQuestionIds yet.
    prisma.checklistQuestion.findMany.mockResolvedValue([
      { id: 'q1', text: 'Live wording 1' },
      { id: 'q3', text: 'Live wording 3' },
    ]);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    const result = await repository.findDraftWithLiveQuestions(TEMPLATE_ID);

    expect(result?.questions).toEqual([
      { questionId: 'q1', order: 1, text: 'Live wording 1' },
      { questionId: 'q3', order: 2, text: 'Live wording 3' },
    ]);
  });
});
