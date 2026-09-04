import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ReviewTemplateEmptyError } from '../../domain/errors/review-template-empty.error';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict.error';
import { PrismaReviewTemplateRepository } from './prisma-review-template.repository';

// Unit spec against a mocked PrismaService (not integration) — mirrors
// PrismaDraftSelectionCleaner's mock/assertion-ratio discipline
// (strict-tdd.md): asserts the tagged-template SQL and statement ORDER
// activate() issues inside its Serializable $transaction, without needing a
// real Postgres connection. The genuine two-connection concurrency proof is
// prisma-review-template-activation.integration.spec.ts (tasks.md 9.3),
// against real Postgres.
type QueryRawMock = jest.Mock<
  Promise<unknown[]>,
  [TemplateStringsArray, ...unknown[]]
>;
type ExecuteRawMock = jest.Mock<
  Promise<number>,
  [TemplateStringsArray, ...unknown[]]
>;

interface TxMock {
  $queryRaw: QueryRawMock;
  $executeRaw: ExecuteRawMock;
}

function makeTxMock(overrides?: Partial<TxMock>): TxMock {
  return {
    $queryRaw: jest.fn<
      Promise<unknown[]>,
      [TemplateStringsArray, ...unknown[]]
    >(),
    $executeRaw: jest.fn<
      Promise<number>,
      [TemplateStringsArray, ...unknown[]]
    >(),
    ...overrides,
  };
}

function makePrismaMock(tx: TxMock) {
  return {
    $transaction: jest.fn(
      (
        work: (tx: TxMock) => Promise<unknown>,
        options: { isolationLevel: string },
      ): Promise<unknown> => {
        void options;
        return work(tx);
      },
    ),
  };
}

const TEMPLATE_ID = 'template-1';
const ROW_IDS = ['row-1', 'row-2'];

describe('PrismaReviewTemplateRepository.activate()', () => {
  it('runs the transaction with Serializable isolation', async () => {
    const tx = makeTxMock({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            elementType: 'EXTINGUISHER',
            frequency: 'QUARTERLY',
            draftQuestionIds: ['q1', 'q2'],
          },
        ])
        .mockResolvedValueOnce([{ nextVersion: 1 }]) as QueryRawMock,
      $executeRaw: jest
        .fn()
        .mockResolvedValueOnce(2) // INSERT ... SELECT snapshot
        .mockResolvedValueOnce(0) // retire predecessor
        .mockResolvedValueOnce(1) as ExecuteRawMock, // flip to active
    });
    const prisma = makePrismaMock(tx);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await repository.activate(TEMPLATE_ID, ROW_IDS);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const options = prisma.$transaction.mock.calls[0][1];
    expect(options.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.Serializable,
    );
  });

  it('runs the snapshot INSERT before retiring the predecessor, and retires the predecessor before flipping this row to active (statement order is load-bearing)', async () => {
    const callOrder: string[] = [];
    const tx = makeTxMock({
      $queryRaw: jest.fn((strings: TemplateStringsArray) => {
        const sql = strings.join('');
        if (sql.includes('COALESCE(MAX')) {
          callOrder.push('read-version');
          return Promise.resolve([{ nextVersion: 1 }]);
        }
        callOrder.push('read-lineage');
        return Promise.resolve([
          {
            elementType: 'EXTINGUISHER',
            frequency: 'QUARTERLY',
            draftQuestionIds: ['q1'],
          },
        ]);
      }) as QueryRawMock,
      $executeRaw: jest.fn((strings: TemplateStringsArray) => {
        const sql = strings.join('');
        if (sql.includes('INSERT INTO "ReviewTemplateQuestion"')) {
          callOrder.push('snapshot-insert');
          return Promise.resolve(1);
        }
        if (sql.includes('SET "status" = \'retired\'')) {
          callOrder.push('retire-predecessor');
          return Promise.resolve(1);
        }
        if (sql.includes('SET "status" = \'active\'')) {
          callOrder.push('flip-to-active');
          return Promise.resolve(1);
        }
        throw new Error(`Unexpected $executeRaw call: ${sql}`);
      }) as ExecuteRawMock,
    });
    const prisma = makePrismaMock(tx);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await repository.activate(TEMPLATE_ID, ROW_IDS);

    expect(callOrder).toEqual([
      'read-lineage',
      'read-version',
      'snapshot-insert',
      'retire-predecessor',
      'flip-to-active',
    ]);
  });

  it('assigns version as COALESCE(MAX(version),0)+1 scoped to the (elementType, frequency) lineage', async () => {
    const tx = makeTxMock({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            elementType: 'EXTINGUISHER',
            frequency: 'QUARTERLY',
            draftQuestionIds: ['q1'],
          },
        ])
        .mockResolvedValueOnce([{ nextVersion: 3 }]) as QueryRawMock,
      $executeRaw: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1) as ExecuteRawMock,
    });
    const prisma = makePrismaMock(tx);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    const outcome = await repository.activate(TEMPLATE_ID, ROW_IDS);

    expect(outcome).toEqual({
      id: TEMPLATE_ID,
      status: 'active',
      version: 3,
    });
    const versionQueryCall = tx.$queryRaw.mock.calls[1];
    const versionSql = versionQueryCall[0].join('');
    expect(versionSql).toContain('COALESCE(MAX("version"), 0) + 1');
    expect(versionQueryCall.slice(1)).toEqual(['EXTINGUISHER', 'QUARTERLY']);
  });

  it('rolls back and throws ReviewTemplateEmptyError when the snapshot INSERT...SELECT matches zero rows (every selected question was concurrently soft-deleted)', async () => {
    const tx = makeTxMock({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            elementType: 'EXTINGUISHER',
            frequency: 'QUARTERLY',
            draftQuestionIds: ['q1'],
          },
        ])
        .mockResolvedValueOnce([{ nextVersion: 1 }]) as QueryRawMock,
      $executeRaw: jest.fn().mockResolvedValueOnce(0) as ExecuteRawMock, // INSERT...SELECT matched 0 rows
    });
    const prisma = makePrismaMock(tx);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toThrow(
      ReviewTemplateEmptyError,
    );

    // Only the snapshot INSERT ran — retire/flip never fire once the
    // rollback path is taken.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('throws TransactionConflictError when the initial lineage read finds no matching draft row (the losing side of a race)', async () => {
    const tx = makeTxMock({
      $queryRaw: jest.fn().mockResolvedValueOnce([]) as QueryRawMock, // lineage read: 0 rows
    });
    const prisma = makePrismaMock(tx);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toThrow(
      TransactionConflictError,
    );
  });

  it('throws TransactionConflictError when the final flip-to-active UPDATE matches zero rows (a concurrent activation already won)', async () => {
    const tx = makeTxMock({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            elementType: 'EXTINGUISHER',
            frequency: 'QUARTERLY',
            draftQuestionIds: ['q1'],
          },
        ])
        .mockResolvedValueOnce([{ nextVersion: 1 }]) as QueryRawMock,
      $executeRaw: jest
        .fn()
        .mockResolvedValueOnce(1) // snapshot insert
        .mockResolvedValueOnce(0) // retire predecessor
        .mockResolvedValueOnce(0) as ExecuteRawMock, // flip to active: 0 rows
    });
    const prisma = makePrismaMock(tx);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toThrow(
      TransactionConflictError,
    );
  });

  it('maps a P2034 serialization failure from $transaction to TransactionConflictError', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Transaction failed', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      ),
    };
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toThrow(
      TransactionConflictError,
    );
  });

  it('maps a P2002 unique-constraint violation from $transaction to TransactionConflictError', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    };
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toThrow(
      TransactionConflictError,
    );
  });

  // Regression (tasks.md 9.3, discovered via the real-Postgres concurrency
  // integration spec): under Prisma 7 + the @prisma/adapter-pg driver
  // adapter, a raw SQL statement's ($queryRaw/$executeRaw — every statement
  // in activate() is raw) SERIALIZABLE abort does NOT surface as a direct
  // P2034 the way Prisma's typed query API's does. It surfaces wrapped as
  // P2010 ("Raw query failed"), with the Postgres SQLSTATE (40001) embedded
  // in the error's own message instead of a separate structured field.
  it('maps a raw-query-wrapped P2010 whose message embeds SQLSTATE 40001 (serialization_failure) to TransactionConflictError', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError(
            'Raw query failed. Code: `40001`. Message: `could not serialize access due to concurrent update`',
            { code: 'P2010', clientVersion: 'test' },
          ),
        ),
    };
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toThrow(
      TransactionConflictError,
    );
  });

  it('maps a raw-query-wrapped P2010 whose message embeds SQLSTATE 23505 (unique_violation) to TransactionConflictError', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError(
            'Raw query failed. Code: `23505`. Message: `duplicate key value violates unique constraint`',
            { code: 'P2010', clientVersion: 'test' },
          ),
        ),
    };
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toThrow(
      TransactionConflictError,
    );
  });

  // Regression (sdd-verify C-1, PR 12/12): under real concurrent
  // activations, activate()'s statement shape (INSERT, then a lineage-wide
  // UPDATE ... WHERE status='active', then a single-row UPDATE ... WHERE
  // id=...) deadlocks readily — Postgres aborts the loser with SQLSTATE
  // 40P01 (deadlock_detected), the same class-40 "Transaction Rollback"
  // family as 40001, but a DISTINCT code that isActivationConflict() did not
  // recognise. Reproduced deterministically against real Postgres (40
  // iterations x 3 concurrent activate() calls on the same draft: 78/80
  // losing requests escaped as an unmapped P2010 instead of
  // TransactionConflictError).
  it('maps a raw-query-wrapped P2010 whose message embeds SQLSTATE 40P01 (deadlock_detected) to TransactionConflictError', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError(
            'Raw query failed. Code: `40P01`. Message: `deadlock detected`',
            { code: 'P2010', clientVersion: 'test' },
          ),
        ),
    };
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toThrow(
      TransactionConflictError,
    );
  });

  it('does NOT swallow a P2010 whose message does not embed a known conflict SQLSTATE — rethrows the raw error', async () => {
    const original = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `23503`. Message: `foreign key violation`',
      { code: 'P2010', clientVersion: 'test' },
    );
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(original),
    };
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.activate(TEMPLATE_ID, ROW_IDS)).rejects.toBe(
      original,
    );
  });

  it('binds templateId and rowIds into the snapshot INSERT...SELECT statement', async () => {
    const tx = makeTxMock({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            elementType: 'EXTINGUISHER',
            frequency: 'QUARTERLY',
            draftQuestionIds: ['q1', 'q2'],
          },
        ])
        .mockResolvedValueOnce([{ nextVersion: 1 }]) as QueryRawMock,
      $executeRaw: jest
        .fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1) as ExecuteRawMock,
    });
    const prisma = makePrismaMock(tx);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await repository.activate(TEMPLATE_ID, ROW_IDS);

    const insertCall = tx.$executeRaw.mock.calls[0];
    const insertSql = insertCall[0].join('');
    expect(insertSql).toContain('INSERT INTO "ReviewTemplateQuestion"');
    expect(insertSql).toContain('JOIN "ChecklistQuestion" q');
    expect(insertSql).toContain('ROW_NUMBER() OVER (ORDER BY sel.ord)');
    expect(insertCall.slice(1)).toEqual([TEMPLATE_ID, ['q1', 'q2'], ROW_IDS]);
  });

  // design.md Data Flow step 5d: the flip-to-active UPDATE also resets
  // draftQuestionIds to '{}' — a frozen row never carries a stale draft
  // selection (Decision 2/6).
  it('resets draftQuestionIds to an empty array in the flip-to-active UPDATE', async () => {
    const tx = makeTxMock({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            elementType: 'EXTINGUISHER',
            frequency: 'QUARTERLY',
            draftQuestionIds: ['q1'],
          },
        ])
        .mockResolvedValueOnce([{ nextVersion: 1 }]) as QueryRawMock,
      $executeRaw: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1) as ExecuteRawMock,
    });
    const prisma = makePrismaMock(tx);
    const repository = new PrismaReviewTemplateRepository(
      prisma as unknown as PrismaService,
    );

    await repository.activate(TEMPLATE_ID, ROW_IDS);

    const flipCall = tx.$executeRaw.mock.calls[2];
    const flipSql = flipCall[0].join('');
    expect(flipSql).toContain('"draftQuestionIds" = ARRAY[]::uuid[]');
  });
});
