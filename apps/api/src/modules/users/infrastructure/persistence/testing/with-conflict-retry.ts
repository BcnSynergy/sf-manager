import { TransactionConflictError } from '../../../domain/errors/transaction-conflict.error';

export interface ConflictRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Test helper (EN-145, EN-147, EN-148). Re-runs a whole SERIALIZABLE
// `transactional()` call when it aborts with TransactionConflictError:
// PrismaUserRepository maps P2034 (Postgres 40001 serialization failure or
// 40P01 deadlock) only after `$transaction` rejected, so Postgres has already
// rolled the attempt back and a retry starts clean. Before retry n it waits
// baseDelayMs * n, giving a still-running concurrent transaction time to
// finish instead of hitting the same cycle again.
//
// Only TransactionConflictError is retried. A transaction timeout (P2028), a
// dropped connection, or any other error is not mapped to it and is
// rethrown at once; the last conflict is rethrown once the attempts run out.
export async function withConflictRetry<T>(
  run: () => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 25,
    sleep = defaultSleep,
  }: ConflictRetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof TransactionConflictError) || attempt >= attempts) {
        throw error;
      }
    }
    await sleep(baseDelayMs * attempt);
  }
}
