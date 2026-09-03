import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict.error';
import { ReviewTemplate } from '../../domain/review-template.entity';
import { PrismaReviewTemplateRepository } from './prisma-review-template.repository';

const idGenerator = new UuidV7IdGenerator();

// Integration test against a real (test) Postgres instance (design.md
// Testing Strategy), mirroring
// prisma-community-representative.repository.integration.spec.ts's
// concurrent-activation test and prisma-user.repository.integration.spec.ts's
// concurrent-admin-demotion test. tasks.md 9.3 — the genuine two-connection
// concurrency proof for the unit-mocked contract already covered by
// prisma-review-template.repository.spec.ts (9.1).
//
// Unlike the community-representative scenario (which needed an explicit
// read-then-write barrier because both transactions race for a SHARED
// "slot" via a conditional read), this scenario races two SEPARATE
// connections to activate() the SAME single draft row directly — a much
// simpler shape closer to the admin-demotion precedent, since Postgres's
// own row-level locking on the shared `id` predicate is what forces the
// second transaction to block behind the first (or SERIALIZABLE aborts it
// outright), not an artificial synchronization point in the test.
describe('PrismaReviewTemplateRepository.activate() (integration, concurrency)', () => {
  let prisma1: PrismaService;
  let prisma2: PrismaService;
  let repository1: PrismaReviewTemplateRepository;
  let repository2: PrismaReviewTemplateRepository;

  beforeAll(async () => {
    // Two INDEPENDENT PrismaService instances -> two independent Postgres
    // connections, so the two activate() calls below genuinely run on
    // separate backends and can genuinely overlap, mirroring the
    // community-representative precedent's two-connection setup.
    prisma1 = new PrismaService();
    prisma2 = new PrismaService();
    await prisma1.$connect();
    await prisma2.$connect();
    repository1 = new PrismaReviewTemplateRepository(prisma1);
    repository2 = new PrismaReviewTemplateRepository(prisma2);
  });

  afterAll(async () => {
    await prisma1.$disconnect();
    await prisma2.$disconnect();
  });

  const uniqueName = (label: string) => `${label}-${randomUUID()}`;

  const createLiveQuestion = async (label: string): Promise<string> => {
    const id = idGenerator.generate();
    await prisma1.checklistQuestion.create({
      data: {
        id,
        elementType: 'EXTINGUISHER',
        frequencies: ['QUARTERLY'],
        text: uniqueName(label),
        deletedAt: null,
      },
    });
    return id;
  };

  const createDraftTemplate = async (
    label: string,
    draftQuestionIds: string[],
  ): Promise<string> => {
    const id = idGenerator.generate();
    await repository1.create(
      new ReviewTemplate({
        id,
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: uniqueName(label),
        version: null,
        status: 'draft',
        draftQuestionIds,
        createdAt: new Date(),
        deletedAt: null,
      }),
    );
    return id;
  };

  // design.md Decision 3/4; spec.md "Concurrent activations leave exactly
  // one active version" — two callers race to activate() the exact SAME
  // draft. Both connections issue their full lineage-read -> version-read
  // -> snapshot-insert -> retire -> flip sequence concurrently; Postgres's
  // SERIALIZABLE isolation (SSI abort, P2034) or the
  // `"status" = 'draft'` guard on the final flip UPDATE (matching 0 rows
  // once the other connection already committed) resolves the race
  // deterministically — exactly one activate() call resolves, the other
  // rejects with TransactionConflictError, and exactly one `active` row
  // exists afterwards for this template id.
  it('two concurrent activate() calls on the SAME draft: exactly one succeeds, the other rejects with TransactionConflictError, exactly one active row remains', async () => {
    const questionId = await createLiveQuestion('concurrent-activate');
    const templateId = await createDraftTemplate('concurrent-activate', [
      questionId,
    ]);

    const rowIds1 = [idGenerator.generate()];
    const rowIds2 = [idGenerator.generate()];

    const results = await Promise.allSettled([
      repository1.activate(templateId, rowIds1),
      repository2.activate(templateId, rowIds2),
    ]);

    const isFulfilled = <T>(
      result: PromiseSettledResult<T>,
    ): result is PromiseFulfilledResult<T> => result.status === 'fulfilled';
    const isRejected = <T>(
      result: PromiseSettledResult<T>,
    ): result is PromiseRejectedResult => result.status === 'rejected';

    const fulfilled = results.filter(isFulfilled);
    const rejected = results.filter(isRejected);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(TransactionConflictError);

    const activeRows = await prisma1.reviewTemplate.findMany({
      where: { id: templateId, status: 'active' },
    });
    expect(activeRows).toHaveLength(1);
    // This suite reuses the app's own dev database with no per-test
    // isolation (same caveat as prisma-user.repository.integration.spec.ts
    // / prisma-community-representative.repository.integration.spec.ts) —
    // the (EXTINGUISHER, QUARTERLY) lineage may already carry prior
    // versions from earlier runs, so the exact version NUMBER is not
    // asserted, only that the winning call's own returned outcome matches
    // what actually landed in the database.
    expect(activeRows[0].version).toBe(fulfilled[0].value.version);

    // Exactly one snapshot's worth of question rows exists — the losing
    // transaction's INSERT...SELECT was rolled back entirely, not left as
    // an orphaned partial snapshot.
    const snapshotRows = await prisma1.reviewTemplateQuestion.findMany({
      where: { templateId },
    });
    expect(snapshotRows).toHaveLength(1);
  });
});
